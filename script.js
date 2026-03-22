const analyzeBtn = document.getElementById('analyzeBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const summaryEl = document.getElementById('summary');
const suriButton = document.querySelector('.btn-suri');

// Suri It button handler - navigate to summarizer
if (suriButton) {
  suriButton.addEventListener('click', () => {
    window.location.href = 'summarizer.html';
  });
}

let abortController = null;
let stopRequested = false;

const verifiedNews = [
  { title: 'Global Climate Agreement', source: 'Reuters', url: 'https://www.reuters.com/world/global-climate/', tags: ['climate', 'environment', 'agreement'] },
  { title: 'World Health Update', source: 'BBC', url: 'https://www.bbc.com/news/health', tags: ['health', 'pandemic', 'wellness'] },
  { title: 'Tech Regulation', source: 'AP News', url: 'https://apnews.com/', tags: ['technology', 'ai', 'policy'] },
  { title: 'Election Coverage', source: 'NPR', url: 'https://www.npr.org/', tags: ['election', 'politics', 'government'] },
];

function isHttpUrl(input) {
  try {
    const u = new URL(input);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

function extractArticleText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove scripts, styles, and other non-content elements
  const elementsToRemove = doc.querySelectorAll('script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar');
  elementsToRemove.forEach(el => el.remove());

  // Try to find main content areas
  const contentSelectors = ['article', 'main', '.content', '.article-body', '.post-content', '.entry-content'];
  let content = null;
  for (const selector of contentSelectors) {
    content = doc.querySelector(selector);
    if (content) break;
  }

  // Fallback to body if no specific content found
  if (!content) content = doc.body;

  // Extract text from paragraphs and headings
  const textElements = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
  let text = Array.from(textElements).map(el => el.innerText.trim()).join(' ').replace(/\s+/g, ' ');

  // If no structured content, use all innerText but clean it
  if (!text) {
    text = content.innerText.replace(/\s+/g, ' ').trim();
  }

  return text || 'No readable text found in the article.';
}

function summarizeText(text, maxSentences = 3) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return sentences.slice(0, maxSentences).join(' ') || 'No summary available.';
}

function detectFakeLikelihood(source, text) {
  const suspiciousWords = ['miracle', 'shocking', 'click here', 'you won', 'urgent', 'conspiracy', 'fake'];
  const lower = (text || '') .toLowerCase();

  const badCount = suspiciousWords.reduce((acc, word) => acc + (lower.includes(word) ? 1 : 0), 0);
  const sourceScore = /reuters|bbc|apnews|npr|theguardian/.test(source.toLowerCase()) ? 0 : 1;

  const score = badCount + sourceScore;
  if (score <= 1) return { label: 'Likely Real', confidence: 'High' };
  if (score === 2) return { label: 'Possibly Dubious', confidence: 'Medium' };
  return { label: 'Likely Fake', confidence: 'Low' };
}

async function animateResponse(content) {
  summaryEl.textContent = '';
  resultEl.classList.remove('hidden');
  for (let i = 0; i < content.length; i++) {
    if (stopRequested) {
      statusEl.textContent = 'Stopped by user.';
      return;
    }
    summaryEl.textContent += content[i];
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function animateText(content, element) {
  element.innerHTML = '';
  const markdownHtml = parseMarkdown(content);
  element.innerHTML = markdownHtml;
  
  // Fade in the container
  element.style.opacity = '0';
  element.style.transition = 'opacity 0.5s ease-in-out';
  
  await new Promise(resolve => setTimeout(resolve, 10));
  element.style.opacity = '1';
}

function parseMarkdown(text) {
  // Split by section headers (Summary:, Validity:, Source:, Note:)
  const sections = text.split(/\n(?=Summary:|Validity:|Source:|Note:)/);
  
  let html = '';
  
  sections.forEach((section) => {
    section = section.trim();
    if (!section) return;
    
    // Check if this is a section header
    if (section.startsWith('Summary:') || section.startsWith('Validity:') || 
        section.startsWith('Source:') || section.startsWith('Note:')) {
      
      const headerMatch = section.match(/^([^:]+):\s*(.*)/s);
      if (headerMatch) {
        const headerText = headerMatch[1];
        const bodyText = headerMatch[2] || '';
        
        // Determine validity class if this is the Validity section
        let validityClass = '';
        if (headerText === 'Validity' && bodyText) {
          if (bodyText.includes('Likely Fake')) {
            validityClass = ' validity-fake';
          } else if (bodyText.includes('Possibly Dubious')) {
            validityClass = ' validity-dubious';
          } else if (bodyText.includes('Likely Real')) {
            validityClass = ' validity-real';
          }
        }
        
        // Create section div with header
        html += `<div class="md-section${validityClass}">`;
        html += `<div class="md-label">${headerText}</div>`;
        
        if (bodyText.trim()) {
          // Process body text for formatting
          let processedBody = bodyText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="md-link">$1</a>');
          
          // Split by paragraphs (double newlines)
          const paragraphs = processedBody.split(/\n\n+/);
          paragraphs.forEach(para => {
            if (para.trim()) {
              html += `<p class="md-paragraph">${para.replace(/\n/g, '<br>')}</p>`;
            }
          });
        }
        
        html += `</div>`;
      }
    } else {
      // Regular paragraph without section header
      let processedText = section
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="md-link">$1</a>');
      
      const paragraphs = processedText.split(/\n\n+/);
      paragraphs.forEach(para => {
        if (para.trim()) {
          html += `<p class="md-paragraph">${para.replace(/\n/g, '<br>')}</p>`;
        }
      });
    }
  });
  
  return html;
}

if (analyzeBtn) {
  analyzeBtn.addEventListener('click', async () => {
    stopRequested = false;
    abortController = new AbortController();
    statusEl.textContent = 'Processing...';
    summaryEl.textContent = '';
    resultEl.classList.add('hidden');

    const input = document.getElementById('newsInput').value.trim();
    if (!input) {
      statusEl.textContent = 'Type a topic or paste a news URL.';
      return;
    }

    try {
      let responseText;

      if (isHttpUrl(input)) {
        statusEl.textContent = 'Fetching article content and analyzing...';
        const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(input)}`;
        const res = await fetch(proxy, { signal: abortController.signal });
        if (!res.ok) throw new Error('Unable to fetch URL (CORS restrictions may apply).');

        const articleHtml = await res.text();
        const cleanedText = extractArticleText(articleHtml);

        // Detect Cloudflare / JS challenge pages and avoid returning raw script blocks.
        const challengeText = cleanedText.toLowerCase();
        if (challengeText.includes('enable javascript and cookies') || challengeText.includes('cf_chl_opt')) {
          throw new Error('Blocked by anti-bot protection. Please use a direct text-accessible article or a different URL.');
        }

        const summary = summarizeText(cleanedText);
        const fake = detectFakeLikelihood(input, cleanedText);

        responseText = `Summary:\n${summary}\n\nValidity:\n${fake.label} (Confidence: ${fake.confidence})\n\nSource: ${input}`;
        statusEl.textContent = 'Analysis complete.';
      } else {
        statusEl.textContent = 'Searching verified news for topic...';
        const topic = input.toLowerCase();
        const matched = verifiedNews.filter(item => item.tags.some(tag => tag.includes(topic)) || item.title.toLowerCase().includes(topic));

        if (!matched.length) {
          responseText = `No verified sources found for topic '${input}'.`;
          statusEl.textContent = 'No matches found.';
        } else {
          const lines = matched.map(item => `• ${item.title} (${item.source}) - ${item.url}`).join('\n');
          responseText = `Verified news matching '${input}':\n${lines}`;
          statusEl.textContent = `${matched.length} verified item(s) found.`;
        }
      }

      await animateResponse(responseText);
    } catch (error) {
      if (error.name === 'AbortError' || stopRequested) {
        statusEl.textContent = 'Stopped by user.';
      } else {
        statusEl.textContent = `Error: ${error.message}`;
      }
      resultEl.classList.remove('hidden');
      summaryEl.textContent = error.name === 'AbortError' ? 'Operation canceled.' : error.message;
    } finally {
      abortController = null;
    }
  });
}

if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    if (abortController) {
      stopRequested = true;
      abortController.abort();
      statusEl.textContent = 'Stop requested.';
    }
  });
}

// Sign-up form handling
const signupForm = document.getElementById('signupForm');
const formStatus = document.getElementById('formStatus');

if (signupForm) {
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    formStatus.textContent = '';

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const agreeTerms = document.getElementById('agreeTerms').checked;

    // Validation
    if (!firstName || !lastName || !username || !email || !password || !confirmPassword) {
      formStatus.textContent = 'Please fill in all required fields.';
      return;
    }

    if (password !== confirmPassword) {
      formStatus.textContent = 'Passwords do not match.';
      return;
    }

    if (password.length < 8) {
      formStatus.textContent = 'Password must be at least 8 characters long.';
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      formStatus.textContent = 'Please enter a valid email address.';
      return;
    }

    if (!agreeTerms) {
      formStatus.textContent = 'You must agree to the terms and conditions.';
      return;
    }

    // Simulate sign-up (in a real app, send to server)
    const userData = { firstName, lastName, username, email, phone };
    localStorage.setItem('userData', JSON.stringify(userData));

    formStatus.textContent = 'Account created successfully! Welcome, ' + firstName + '.';
    formStatus.style.color = '#0f62ff';
    signupForm.reset();
  });
}

// Login form handling
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');

if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginStatus.textContent = '';

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
      loginStatus.textContent = 'Please enter username/email and password.';
      return;
    }

    // Simulate login check (in a real app, send to server)
    const storedUser = JSON.parse(localStorage.getItem('userData') || '{}');
    if (storedUser.username === username || storedUser.email === username) {
      // For demo, just check if user exists; in real app, verify password hash
      loginStatus.textContent = 'Login successful! Welcome back, ' + storedUser.firstName + '.';
      loginStatus.style.color = '#0f62ff';
      loginForm.reset();
    } else {
      loginStatus.textContent = 'Invalid username/email or password.';
    }
  });
}

// Summarizer form handling
const summarizerForm = document.getElementById('summarizerForm');
const summaryStatus = document.getElementById('summaryStatus');
const summaryOutput = document.getElementById('summaryOutput');
const summaryText = document.getElementById('summaryText');

if (summarizerForm) {
  console.log('Summarizer form found, adding event listener');
  summarizerForm.addEventListener('submit', async (e) => {
    console.log('Form submitted');
    e.preventDefault();
    summaryStatus.textContent = 'Processing...';
    summaryOutput.style.display = 'none';
    summaryText.textContent = '';

    const input = document.getElementById('inputText').value.trim();
    console.log('Input:', input);
    if (!input) {
      summaryStatus.textContent = 'Please enter a news link or topic.';
      return;
    }

    try {
      let responseText;

      if (isHttpUrl(input)) {
        console.log('Processing as URL');
        summaryStatus.textContent = 'Fetching article content and analyzing...';
        try {
          const apiUrl = `http://172.17.26.219:5000/summarize?url=${encodeURIComponent(input)}`;
          const res = await fetch(apiUrl);
          if (!res.ok) throw new Error(`API request failed: ${res.status}`);
          
          const data = await res.json();
          
          if (data.error) {
            throw new Error(data.error);
          }
          
          responseText = `Summary:\n${data.summary}\n\nValidity:\n${data.validity.label} (Confidence: ${data.validity.confidence})\n\nSource: ${data.source}`;
          summaryStatus.textContent = 'Analysis complete.';
        } catch (apiError) {
          console.warn('API call failed, using fallback:', apiError.message);
          // Fallback to simulated response
          const mockSummary = "This article appears to be about current events. In a full implementation, the actual content would be fetched and summarized here.";
          const mockFake = { label: 'Unable to Verify', confidence: 'Low' };
          responseText = `Summary:\n${mockSummary}\n\nValidity:\n${mockFake.label} (Confidence: ${mockFake.confidence})\n\nSource: ${input}\n\nNote: Backend service not available - ${apiError.message}`;
          summaryText.textContent = '';
          summaryOutput.style.display = 'block';
          await animateText(responseText, summaryText);
          summaryStatus.textContent = 'Analysis complete (fallback mode).';
        }
      } else {
        console.log('Processing as topic');
        summaryStatus.textContent = 'Searching verified news for topic...';
        const topic = input.toLowerCase();
        const matched = verifiedNews.filter(item => item.tags.some(tag => tag.includes(topic)) || item.title.toLowerCase().includes(topic));

        if (!matched.length) {
          responseText = `No verified sources found for topic '${input}'.`;
          summaryStatus.textContent = 'No matches found.';
        } else {
          const lines = matched.map(item => `• ${item.title} (${item.source}) - ${item.url}`).join('\n');
          responseText = `Verified news matching '${input}':\n${lines}`;
          summaryStatus.textContent = `${matched.length} verified item(s) found.`;
        }
      }

        console.log('Response text:', responseText);
        summaryText.textContent = '';
        summaryOutput.style.display = 'block';
        await animateText(responseText, summaryText);
        summaryStatus.textContent = 'Analysis complete.';
    } catch (error) {
      console.error('Error:', error);
      summaryStatus.textContent = `Error: ${error.message}`;
      summaryText.textContent = '';
      summaryOutput.style.display = 'block';
      await animateText(error.message, summaryText);
    }
  });
} else {
  console.log('Summarizer form not found');
}
