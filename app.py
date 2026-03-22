from flask import Flask, request, jsonify
import requests
from bs4 import BeautifulSoup
import re

app = Flask(__name__)

# Simple CORS headers
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

def is_http_url(input_str):
    try:
        from urllib.parse import urlparse
        parsed = urlparse(input_str)
        return parsed.scheme in ['http', 'https']
    except:
        return False

def extract_article_text(html):
    soup = BeautifulSoup(html, 'html.parser')
    
    # Remove scripts, styles, nav, etc.
    for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript']):
        tag.decompose()
    
    # Try to find main content
    content = None
    selectors = ['article', 'main', '.content', '.article-body', '.post-content', '.entry-content']
    for selector in selectors:
        content = soup.select_one(selector)
        if content:
            break
    
    if not content:
        content = soup.body or soup
    
    # Extract text from paragraphs and headings
    text_elements = content.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'])
    text = ' '.join([elem.get_text().strip() for elem in text_elements if elem.get_text().strip()])
    
    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text or 'No readable text found in the article.'

def summarize_text(text, max_sentences=3):
    if not text:
        return 'No content to summarize.'
    
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    return ' '.join(sentences[:max_sentences])

def detect_fake_likelihood(source, text):
    suspicious_words = ['miracle', 'shocking', 'click here', 'you won', 'urgent', 'conspiracy', 'fake']
    lower_text = (text or '').lower()
    
    bad_count = sum(1 for word in suspicious_words if word in lower_text)
    source_score = 0 if re.search(r'reuters|bbc|apnews|npr|theguardian', source.lower()) else 1
    
    score = bad_count + source_score
    if score <= 1:
        return {'label': 'Likely Real', 'confidence': 'High'}
    elif score == 2:
        return {'label': 'Possibly Dubious', 'confidence': 'Medium'}
    else:
        return {'label': 'Likely Fake', 'confidence': 'Low'}

@app.route('/summarize', methods=['GET'])
def summarize():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL parameter required'}), 400
    
    if not is_http_url(url):
        return jsonify({'error': 'Invalid URL'}), 400
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        html = response.text
        cleaned_text = extract_article_text(html)
        
        if len(cleaned_text) < 100:
            return jsonify({
                'summary': 'Unable to extract sufficient content from this article.',
                'validity': {'label': 'Unable to Verify', 'confidence': 'Low'},
                'source': url,
                'error': 'Insufficient content extracted'
            })
        
        summary = summarize_text(cleaned_text)
        validity = detect_fake_likelihood(url, cleaned_text)
        
        return jsonify({
            'summary': summary,
            'validity': validity,
            'source': url
        })
    
    except requests.RequestException as e:
        return jsonify({
            'summary': 'Failed to fetch the article.',
            'validity': {'label': 'Unable to Verify', 'confidence': 'Low'},
            'source': url,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)