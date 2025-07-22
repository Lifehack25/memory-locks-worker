// Sophisticated bot detection middleware for Cloudflare Workers

// Simple URL parser for Cloudflare Workers
interface SimpleURL {
  hostname: string;
}

function parseURL(url: string): SimpleURL | null {
  try {
    // Simple regex-based URL parsing for hostname extraction
    const match = url.match(/^https?:\/\/([^\/]+)/);
    return match ? { hostname: match[1] } : null;
  } catch {
    return null;
  }
}

interface RequestHeaders {
  'accept-language'?: string;
  'sec-fetch-site'?: string;
  'sec-fetch-mode'?: string;
  'sec-fetch-dest'?: string;
  'sec-ch-ua'?: string;
  'sec-ch-ua-mobile'?: string;
  'sec-ch-ua-platform'?: string;
  'cache-control'?: string;
  'pragma'?: string;
  'upgrade-insecure-requests'?: string;
}

export class BotProtectionService {
  private static readonly BOT_PATTERNS = [
    // AI/ML services and APIs
    /openai|gpt|claude|anthropic|chatgpt|bard|gemini/i,
    /llm|language.*model|ai.*assistant/i,
    
    // Search engine crawlers
    /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot/i,
    /facebookexternalhit|twitterbot|linkedinbot|whatsapp/i,
    /crawler|spider|scraper|bot|indexer/i,
    
    // Security and testing tools
    /nmap|sqlmap|nikto|dirb|gobuster|ffuf|burp/i,
    /nuclei|katana|subfinder|httpx|masscan/i,
    /nessus|qualys|rapid7|vulnerability.*scanner/i,
    
    // HTTP libraries and automation tools
    /curl|wget|python.*requests|urllib|httpie/i,
    /postman|insomnia|paw|restclient/i,
    /selenium|puppeteer|playwright|headless/i,
    /phantom|splash|chrome.*headless|firefox.*headless/i,
    /scrapy|beautiful.*soup|mechanize/i,
    
    // Monitoring and uptime services
    /pingdom|uptimerobot|statuspage|hetrix.*tools/i,
    /site.*monitor|uptime.*monitor|alertsite/i,
    
    // Social media and preview generators
    /discordbot|telegrambot|slackbot|msteams/i,
    /preview.*generator|link.*preview|meta.*scraper/i,
    
    // Generic bot indicators
    /automated|script|tool.*\d+/i,
    /^[a-z]+\/\d+\.\d+$/, // Simple version patterns like "tool/1.0"
  ];

  private static readonly MOBILE_PATTERNS = [
    /Mobile.*Safari/i,
    /Android.*Chrome/i,
    /iPhone.*Safari/i,
    /iPad.*Safari/i,
    /Mobile.*Firefox/i,
    /Opera.*Mobile/i,
    /Samsung.*Browser/i,
    /Edge.*Mobile/i
  ];

  private static readonly ALLOWED_MOBILE_APPS = [
    // .NET HttpClient patterns (for MAUI app)
    /^\.NET\/\d+\.\d+/,
    /.NET.*HttpClient/,
    /Xamarin/i,
    /MAUI/i,
    
    // Legitimate mobile app user agents
    /CFNetwork\/\d+\.\d+/,  // iOS apps
    /Dalvik\/\d+\.\d+/,     // Android apps
  ];

  static isBot(userAgent: string, referer?: string | null, headers: RequestHeaders = {}): boolean {
    // Null or very short user agents are suspicious
    if (!userAgent || userAgent.length < 10) {
      return true;
    }

    // Allow specific mobile app user agents (MAUI, iOS, Android apps)
    const isAllowedApp = this.ALLOWED_MOBILE_APPS.some(pattern => pattern.test(userAgent));
    if (isAllowedApp) {
      return false; // Explicitly allow these apps
    }

    // Check against bot patterns
    const matchesBotPattern = this.BOT_PATTERNS.some(pattern => pattern.test(userAgent));
    if (matchesBotPattern) {
      return true;
    }

    // Check if it's a legitimate mobile browser
    const isMobileBrowser = this.MOBILE_PATTERNS.some(pattern => pattern.test(userAgent));
    if (isMobileBrowser) {
      return false; // Allow legitimate mobile browsers
    }

    // Desktop browser validation - check for essential headers
    if (this.isDesktopBrowser(userAgent)) {
      return this.validateDesktopBrowser(headers, referer);
    }

    // If we can't categorize it as mobile, app, or desktop browser, it's suspicious
    return true;
  }

  private static isDesktopBrowser(userAgent: string): boolean {
    const desktopPatterns = [
      /Windows.*Chrome/i,
      /Windows.*Firefox/i,
      /Windows.*Edge/i,
      /Windows.*Safari/i,
      /Macintosh.*Chrome/i,
      /Macintosh.*Firefox/i,
      /Macintosh.*Safari/i,
      /X11.*Chrome/i,
      /X11.*Firefox/i,
      /Linux.*Chrome/i,
      /Linux.*Firefox/i
    ];

    return desktopPatterns.some(pattern => pattern.test(userAgent));
  }

  private static validateDesktopBrowser(headers: RequestHeaders, referer?: string | null): boolean {
    // Desktop browsers should have Accept-Language header
    if (!headers['accept-language']) {
      return true; // Likely a bot
    }

    // Modern browsers send Sec-Fetch headers
    const hasSecFetchHeaders = headers['sec-fetch-site'] || headers['sec-fetch-mode'] || headers['sec-fetch-dest'];
    if (!hasSecFetchHeaders) {
      return true; // Likely a bot or old automation tool
    }

    // Validate referer - should be empty (direct access) or from allowed domains
    if (referer && referer.length > 0) {
      const refererUrl = this.parseReferer(referer);
      if (refererUrl && !this.isAllowedReferer(refererUrl.hostname)) {
        return true; // External referer is suspicious for album access
      }
    }

    return false; // Passed all checks
  }

  private static parseReferer(referer: string): SimpleURL | null {
    return parseURL(referer);
  }

  private static isAllowedReferer(hostname: string): boolean {
    const allowedDomains = [
      'memorylocks.com',
      'album.memorylocks.com',
      'api.memorylocks.com',
      'localhost',
      '127.0.0.1'
    ];

    return allowedDomains.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
  }

  // Additional validation for specific scenarios
  static validateAlbumAccess(userAgent: string, referer?: string | null, headers: RequestHeaders = {}): boolean {
    // For album access, we're more strict about bots
    if (this.isBot(userAgent, referer, headers)) {
      return false;
    }

    // Additional checks for album access
    // Direct access (empty referer) is allowed for mobile apps and direct links
    if (!referer || referer.length === 0) {
      return true;
    }

    // If there's a referer, validate it's from allowed domains
    const refererUrl = this.parseReferer(referer);
    if (refererUrl && !this.isAllowedReferer(refererUrl.hostname)) {
      return false;
    }

    return true;
  }

  // Get bot detection score for analytics (0 = not bot, 1 = definitely bot)
  static getBotScore(userAgent: string, referer?: string | null, headers: RequestHeaders = {}): number {
    let score = 0;

    // User agent scoring
    if (!userAgent || userAgent.length < 10) score += 0.4;
    if (this.BOT_PATTERNS.some(pattern => pattern.test(userAgent))) score += 0.5;

    // Header scoring
    if (!headers['accept-language']) score += 0.2;
    if (!headers['sec-fetch-site']) score += 0.1;

    // Referer scoring
    if (referer) {
      const refererUrl = this.parseReferer(referer);
      if (refererUrl && !this.isAllowedReferer(refererUrl.hostname)) {
        score += 0.3;
      }
    }

    return Math.min(score, 1); // Cap at 1.0
  }
}