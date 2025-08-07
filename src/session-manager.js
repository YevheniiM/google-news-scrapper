/**
 * Session Manager for handling cookies, user agents, and session rotation
 */

import { log } from 'crawlee';
import { CONFIG } from './config.js';

/**
 * Session Manager class for handling browser sessions and consent pages
 */
export class SessionManager {
    constructor() {
        this.userAgentIndex = 0;
        this.consentBypassStrategies = [
            this.addConsentCookies.bind(this),
            this.addGooglePreferences.bind(this),
            this.addEuropeanBypass.bind(this),
        ];
    }

    /**
     * Get a random user agent
     * @returns {string} User agent string
     */
    getRandomUserAgent() {
        const userAgents = CONFIG.CRAWLER.USER_AGENTS;
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }

    /**
     * Get next user agent in rotation
     * @returns {string} User agent string
     */
    getNextUserAgent() {
        const userAgents = CONFIG.CRAWLER.USER_AGENTS;
        const userAgent = userAgents[this.userAgentIndex % userAgents.length];
        this.userAgentIndex++;
        return userAgent;
    }

    /**
     * Check if response indicates a consent page
     * @param {string} html - HTML content
     * @param {string} url - Response URL
     * @returns {boolean} True if consent page detected
     */
    isConsentPage(html, url) {
        if (!html) return false;

        // Ensure html is a string
        const htmlStr = typeof html === 'string' ? html : String(html);

        // Check for consent page indicators
        const indicators = CONFIG.SESSION.CONSENT_PAGE_INDICATORS;
        const htmlLower = htmlStr.toLowerCase();

        return indicators.some(indicator => htmlLower.includes(indicator.toLowerCase()));
    }

    /**
     * Add consent bypass cookies
     * @param {object} session - Crawlee session object
     */
    async addConsentCookies(session) {
        try {
            const consentCookies = [
                { name: 'CONSENT', value: 'YES+cb.20210720-07-p0.en+FX+410', domain: '.google.com' },
                { name: 'SOCS', value: 'CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg', domain: '.google.com' },
                { name: 'NID', value: '511=consent_accepted', domain: '.google.com' },
            ];

            for (const cookie of consentCookies) {
                await session.setCookies([cookie], 'https://google.com');
            }

            log.debug('Added consent bypass cookies to session');
        } catch (error) {
            log.warning('Failed to add consent cookies:', error.message);
        }
    }

    /**
     * Add Google preferences to bypass consent
     * @param {object} session - Crawlee session object
     */
    async addGooglePreferences(session) {
        try {
            const prefCookies = [
                { name: 'PREF', value: 'f1=50000000&f6=8&hl=en-US&gl=US', domain: '.google.com' },
                { name: '1P_JAR', value: new Date().toISOString().slice(0, 10), domain: '.google.com' },
            ];

            for (const cookie of prefCookies) {
                await session.setCookies([cookie], 'https://google.com');
            }

            log.debug('Added Google preference cookies to session');
        } catch (error) {
            log.warning('Failed to add Google preference cookies:', error.message);
        }
    }

    /**
     * Add European consent bypass
     * @param {object} session - Crawlee session object
     */
    async addEuropeanBypass(session) {
        try {
            const euCookies = [
                { name: 'CONSENT', value: 'PENDING+999', domain: '.google.com' },
                { name: 'ANID', value: 'consent_state_service_pending', domain: '.google.com' },
            ];

            for (const cookie of euCookies) {
                await session.setCookies([cookie], 'https://google.com');
            }

            log.debug('Added European consent bypass cookies to session');
        } catch (error) {
            log.warning('Failed to add European consent bypass cookies:', error.message);
        }
    }

    /**
     * Apply consent bypass strategies to session
     * @param {object} session - Crawlee session object
     * @param {number} strategyIndex - Strategy index to use
     */
    async applyConsentBypass(session, strategyIndex = 0) {
        try {
            if (strategyIndex >= 0 && strategyIndex < this.consentBypassStrategies.length) {
                const strategy = this.consentBypassStrategies[strategyIndex];
                if (typeof strategy === 'function') {
                    await strategy(session);
                    log.debug(`Applied consent bypass strategy ${strategyIndex}`);
                } else {
                    log.warning(`Invalid strategy at index ${strategyIndex}`);
                }
            } else {
                log.warning(`Strategy index ${strategyIndex} is out of bounds`);
            }
        } catch (error) {
            log.warning(`Failed to apply consent bypass strategy ${strategyIndex}:`, error.message);
        }
    }

    /**
     * Get enhanced request headers
     * @param {string} userAgent - User agent to use
     * @returns {object} Request headers
     */
    getEnhancedHeaders(userAgent = null) {
        const ua = userAgent || this.getRandomUserAgent();

        return {
            'User-Agent': ua,
            'Accept': 'application/rss+xml, application/xml, text/xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'DNT': '1',
        };
    }

    /**
     * Configure session pool options
     * @returns {object} Session pool configuration
     */
    getSessionPoolOptions() {
        return {
            maxPoolSize: CONFIG.SESSION.MAX_POOL_SIZE,
            sessionOptions: {
                maxUsageCount: CONFIG.SESSION.MAX_USAGE_COUNT,
                maxErrorScore: CONFIG.SESSION.MAX_ERROR_SCORE,
            },
            persistStateKeyValueStoreId: 'sessions',
        };
    }

    /**
     * Handle blocked or consent page response
     * @param {object} context - Crawler context
     * @returns {boolean} True if retry should be attempted
     */
    async handleBlockedResponse(context) {
        const { response, session, request } = context;
        
        if (!response) return false;

        const isBlocked = CONFIG.SESSION.BLOCKED_STATUS_CODES.includes(response.statusCode);
        const isConsent = this.isConsentPage(response.body, response.url);

        if (isBlocked || isConsent) {
            log.warning(`Blocked/consent page detected for ${request.url}`, {
                statusCode: response.statusCode,
                isConsent,
                sessionId: session?.id,
            });

            // Mark session as blocked
            if (session) {
                session.markBad();
            }

            // Try different consent bypass strategy
            if (isConsent && session) {
                const strategyIndex = (session.userData.consentStrategy || 0) + 1;
                if (strategyIndex < this.consentBypassStrategies.length) {
                    await this.applyConsentBypass(session, strategyIndex);
                    session.userData.consentStrategy = strategyIndex;
                    log.info(`Trying consent bypass strategy ${strategyIndex}`);
                    return true; // Retry with new strategy
                }
            }

            return false; // Don't retry
        }

        return false;
    }
}

export default SessionManager;
