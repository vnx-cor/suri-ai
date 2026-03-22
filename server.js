const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 5000;

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

function isHttpUrl(input) {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractArticleText(html) {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, noscript, .ad, .advertisement, .sidebar').remove();

  // Try to find main content
  let content = null;
  const selectors = ['article', 'main', '.content', '.article-body', '.post-content', '.entry-content'];
  for (const selector of selectors) {
    content = $(selector);
    if (content.length > 0) break;
  }

  if (!content || content.length === 0) {
    content = $('body');
  }

  // Extract text from paragraphs and headings
  const textElements = content.find('p, h1, h2, h3, h4, h5, h6, li');
  let text = '';
  textElements.each((i, elem) => {
    const t = $(elem).text().trim();
    if (t) text += t + ' ';
  });

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text || 'No readable text found in the article.';
}

function summarizeText(text, maxSentences = 3) {
  if (!text) return 'No content to summarize.';

  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  return sentences.slice(0, maxSentences).join(' ');
}

function detectFakeLikelihood(source, text) {
  const suspiciousWords = ['miracle', 'shocking', 'click here', 'you won', 'urgent', 'conspiracy', 'fake'];
  const lowerText = (text || '').toLowerCase();

  const badCount = suspiciousWords.reduce((acc, word) => acc + (lowerText.includes(word) ? 1 : 0), 0);
  const sourceScore = /reuters|bbc|apnews|npr|theguardian/.test(source.toLowerCase()) ? 0 : 1;

  const score = badCount + sourceScore;
  if (score <= 1) return { label: 'Likely Real', confidence: 'High' };
  if (score === 2) return { label: 'Possibly Dubious', confidence: 'Medium' };
  return { label: 'Likely Fake', confidence: 'Low' };
}

app.get('/summarize', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  if (!isHttpUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    console.log('Fetching URL:', url);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    console.log('Fetch successful, status:', response.status);
    const html = response.data;
    console.log('HTML length:', html.length);
    const cleanedText = extractArticleText(html);
    console.log('Cleaned text length:', cleanedText.length);

    if (cleanedText.length < 100) {
      console.log('Insufficient content');
      return res.json({
        summary: 'Unable to extract sufficient content from this article.',
        validity: { label: 'Unable to Verify', confidence: 'Low' },
        source: url,
        error: 'Insufficient content extracted'
      });
    }

    const summary = summarizeText(cleanedText);
    const validity = detectFakeLikelihood(url, cleanedText);

    console.log('Summary generated');
    res.json({
      summary,
      validity,
      source: url
    });

  } catch (error) {
    console.error('Error in /summarize:', error.message);
    res.status(500).json({
      summary: 'Failed to fetch the article.',
      validity: { label: 'Unable to Verify', confidence: 'Low' },
      source: url,
      error: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});