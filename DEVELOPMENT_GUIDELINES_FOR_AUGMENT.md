# Development Guidelines for Google News Scraper

## Overview
This document establishes comprehensive quality assurance standards, testing protocols, and completion criteria for the Google News scraper project. These guidelines ensure reliable performance, maintainable code, and consistent results.

## Task Completion Criteria

### ✅ Issue Resolution Requirements
**Do NOT consider any task complete until ALL of the following conditions are met:**

1. **Demonstrable Fix with Evidence**
   - The reported issue is completely resolved with clear, reproducible evidence
   - Include specific log excerpts showing successful operation
   - Provide before/after comparisons when fixing bugs
   - Document the root cause and solution implemented

2. **Thorough Testing Verification**
   - All changes tested using `apify run --purge` command for clean state
   - Multiple test scenarios executed successfully
   - Edge cases and error conditions properly handled
   - No regressions introduced to existing functionality

3. **Performance Standards Met**
   - Scraper achieves ≥90% success rate for article extraction
   - Consistent performance across multiple test runs
   - Proper error handling and graceful degradation
   - Efficient resource usage and termination

4. **Quality Validation Complete**
   - Code follows established patterns and conventions
   - Proper logging and monitoring in place
   - Documentation updated to reflect changes
   - All tests pass and functionality verified

## Testing Protocol

### 🧪 Mandatory Testing Steps

#### Pre-Testing Setup
```bash
# Always start with clean state
apify run --purge

# Verify INPUT.json configuration
cat INPUT.json

# Clear any cached data if needed
rm -rf storage/key_value_stores/default/INPUT.json
```

#### Core Functionality Tests

1. **maxItems Parameter Testing**
   ```bash
   # Test different maxItems values
   # maxItems=1 (edge case)
   # maxItems=3 (standard case)  
   # maxItems=5 (larger batch)
   ```

2. **Early Termination Verification**
   - Verify `🎯 TARGET REACHED` messages appear
   - Confirm `MAX_ITEMS_REACHED` exception is thrown correctly
   - Ensure no additional processing after limit reached
   - Check batch summaries show correct counts

3. **Multi-Mode Testing**
   ```bash
   # Test RSS feed mode
   {"query": "technology", "maxItems": 3, "useBrowser": false}
   
   # Test direct URLs mode  
   {"testUrls": [...], "maxItems": 2, "useBrowser": false}
   
   # Test browser mode when needed
   {"query": "technology", "maxItems": 2, "useBrowser": true}
   ```

4. **Error Handling Validation**
   - Rate limiting (429 errors) handled gracefully
   - Network timeouts managed properly
   - Invalid URLs processed correctly
   - Consent pages detected and handled

#### Success Criteria Validation

**Required Log Patterns for Success:**
```
✅ SUCCESS: Saved high-quality article (X/Y)
🎯 TARGET REACHED: Saved X/X articles - stopping crawler
✅ Batch N completed: X quality articles saved (X/X total)
✅ Target reached! Successfully extracted X complete articles
Quality-targeted crawling completed: X/X target articles saved
```

**Performance Metrics to Monitor:**
- Success rate: `Successfully saved: X (Y% of processed)`
- Quality rate: Articles meeting 300+ chars + valid images criteria
- Processing efficiency: Time to reach target vs total runtime
- Error distribution: Types and frequency of failures

### 📊 Quality Standards

#### Success Rate Benchmarks

| Rating | Success Rate | Action Required |
|--------|-------------|-----------------|
| **Excellent** | ≥95% | Continue monitoring |
| **Target** | 90-94% | Acceptable performance |
| **Acceptable** | 80-89% | Document failure reasons, monitor trends |
| **Needs Investigation** | 70-79% | Investigate root causes, implement fixes |
| **Unacceptable** | <70% | **STOP** - Immediate investigation and fixes required |

#### Quality Metrics

**Article Quality Standards:**
- ✅ Text content: ≥300 characters of clean, readable text
- ✅ Images: At least 1 valid, accessible image
- ✅ Metadata: Title, URL, publication date when available
- ✅ Content validation: Not error pages, paywalls, or low-quality content

**Performance Standards:**
- ✅ Response time: <30 seconds per article on average
- ✅ Memory usage: Stable, no memory leaks
- ✅ Error rate: <10% for network/parsing errors
- ✅ Retry logic: Appropriate backoff and retry strategies

## Documentation Requirements

### 📝 Evidence and Reporting Standards

#### Test Result Documentation
**Required for each test run:**
```markdown
## Test Results - [Date/Time]

**Configuration:**
- maxItems: X
- useBrowser: true/false
- Query/URLs: [details]

**Results:**
- Articles processed: X
- Successfully saved: X (Y%)
- Failed: X (reasons)
- Runtime: X seconds

**Key Log Excerpts:**
[Include relevant success/error messages]

**Issues Found:**
[Document any problems discovered]
```

#### Bug Report Template
```markdown
## Bug Report - [Issue Title]

**Problem Description:**
[Clear description of the issue]

**Reproduction Steps:**
1. [Step 1]
2. [Step 2]
3. [Result]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Log Evidence:**
[Relevant log excerpts]

**Fix Implemented:**
[Description of solution]

**Verification:**
[Test results confirming fix]
```

### 🔍 Issue Classification

#### Code Issues vs External Issues

**Code Issues (Require Fixes):**
- Logic errors in article processing
- Incorrect maxItems handling
- Memory leaks or performance problems
- Improper error handling
- Missing validation or edge cases

**External Issues (Document but Don't Block):**
- Google News rate limiting (429 errors)
- Website consent pages or paywalls
- Network connectivity problems
- Third-party service outages
- Regional content restrictions

#### Known Limitations Documentation

**Current Known Limitations:**
1. **Rate Limiting**: Google News may return 429 errors during high-frequency testing
   - **Mitigation**: Implement exponential backoff, use proxy rotation
   - **Impact**: May reduce success rate temporarily, not a code issue

2. **Consent Pages**: Many news sites show consent/cookie banners
   - **Mitigation**: Browser fallback mode handles most cases
   - **Impact**: Increases processing time, may require browser mode

3. **Regional Restrictions**: Some content may be geo-blocked
   - **Mitigation**: Proxy configuration for different regions
   - **Impact**: May affect success rate for specific queries

## Continuous Monitoring

### 📈 Performance Tracking

**Daily Monitoring Checklist:**
- [ ] Run standard test suite with `apify run --purge`
- [ ] Check success rates across different configurations
- [ ] Monitor error patterns and frequencies
- [ ] Verify maxItems functionality with edge cases
- [ ] Review log quality and completeness

**Weekly Quality Review:**
- [ ] Analyze success rate trends
- [ ] Review and update known limitations
- [ ] Test with new/different news sources
- [ ] Validate browser fallback effectiveness
- [ ] Performance optimization opportunities

### 🚨 Alert Conditions

**Immediate Investigation Required:**
- Success rate drops below 70%
- maxItems functionality stops working
- Memory usage increases significantly
- New error patterns emerge frequently
- Browser fallback stops working

**Monitoring and Documentation Required:**
- Success rate 70-89%
- Increased rate limiting frequency
- New consent page patterns
- Regional access issues

## Conclusion

These guidelines ensure that:
1. ✅ All issues are thoroughly resolved before marking tasks complete
2. ✅ Testing is comprehensive and standardized
3. ✅ Quality standards are maintained consistently
4. ✅ Documentation provides clear evidence and traceability
5. ✅ External issues are properly distinguished from code issues

**Remember**: A task is only complete when it meets ALL criteria listed above, not just when the code appears to work in a single test run.
