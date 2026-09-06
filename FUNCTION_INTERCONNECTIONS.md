# Function Inventory + Interconnection Map

Generated: 2026-09-06 22:31:07 CEST

## Scope

This is the repo-local function and dependency map for `decide`.

Companion artifacts:

- [OUTBOUND_DOMAIN_INVENTORY.md](OUTBOUND_DOMAIN_INVENTORY.md)
- [OUTBOUND_URL_PARSE_ISSUES.md](OUTBOUND_URL_PARSE_ISSUES.md)

## Function Surface

### Scan targets

`api lib client scripts `

### Function declarations

```text
api/cancel-mcp.js:53:function formatTextMessage(payload) {
api/cancel-mcp.js:63:export default createMcpHandler({
api/compliance-export.js:18:export default async function complianceExportHandler(req, res) {
api/compliance-export.js:3:function sendJson(res, statusCode, payload) {
api/compliance-export.js:9:function readFormat(req) {
api/decide.js:1127:    const getGeminiProviderOrRespond = async (advisoryMode, lineageInput) => {
api/decide.js:116:function readGeminiText(data) {
api/decide.js:122:function buildGeminiResponseJsonSchema(advisoryMode, options = []) {
api/decide.js:220:function readSingleGeminiAnswer(data) {
api/decide.js:232:function sanitizeScore(n) {
api/decide.js:239:function sanitizeUnitScore(n) {
api/decide.js:24:function rid() {
api/decide.js:251:function normalizeRisk(value, fallback = "medium") {
api/decide.js:257:function normalizeRuntimeCitations(citations) {
api/decide.js:287:function validateRuntimeProviderOutput(payload = {}, options = []) {
api/decide.js:28:function normalize(s = "") {
api/decide.js:32:function wantsAdvice(q) {
api/decide.js:342:function summarizeInputEvidenceValue(value) {
api/decide.js:353:function buildInputEvidenceSummary(inputs = {}) {
api/decide.js:360:function buildRuntimeFallbackEvidence(payload = {}, context = {}) {
api/decide.js:36:function isFinanceAdvice(q) {
api/decide.js:426:function normalizeHeaderValue(value) {
api/decide.js:42:function isMedicalAdvice(q) {
api/decide.js:431:function readHeader(req, name = "") {
api/decide.js:442:function readApiToken(req) {
api/decide.js:454:function findCallerSuppliedRulebookOutputFields(body = {}) {
api/decide.js:461:async function requestGeminiGenerateContent({
api/decide.js:48:function isLegalAdvice(q) {
api/decide.js:54:function parseMultiQuestion(raw = "") {
api/decide.js:614:function sendGeminiRequestFailure(res, result, request_id, lineageInput) {
api/decide.js:734:function safeEqualToken(left, right) {
api/decide.js:73:function asObject(value, fallback = {}) {
api/decide.js:744:function parseFlag(value) {
api/decide.js:749:function shouldRequireDecisionApiAuth(env = process.env) {
api/decide.js:759:function readTrustedProxyContext(req) {
api/decide.js:77:function toStringArray(value, maxLength = 8) {
api/decide.js:785:function sendDecisionJson(res, statusCode, payload, lineageInput = {}) {
api/decide.js:812:export default async function handler(req, res) {
api/decide.js:85:function isFiniteJsonNumber(value) {
api/decide.js:89:function isNonEmptyJsonString(value) {
api/decide.js:93:function isStrictStringArray(value, minLength = 1) {
api/decide.js:97:function extractJson(text = "") {
api/health.js:12:function inferServiceFromHost(host) {
api/health.js:3:function normalizeHost(req) {
api/health.js:51:export default function handler(req, res) {
api/mcp.js:56:function formatTextMessage(payload) {
api/mcp.js:66:export default createMcpHandler({
api/metrics.js:21:export function resetMcpAdoptionCacheForTests() {
api/metrics.js:25:function send(res, status, payload) {
api/metrics.js:31:export default async function handler(req, res) {
api/metrics.js:9:async function getCachedPolicyGrowthReports() {
api/policy-alerts.js:101:export function attachPolicyEventDetails(alerts = [], policyEvents = []) {
api/policy-alerts.js:143:export function applyPolicyEventReviews(alerts = [], eventReviews = []) {
api/policy-alerts.js:168:function normalizeReviewStatus(value = "") {
api/policy-alerts.js:16:function send(res, statusCode, payload) {
api/policy-alerts.js:172:function withoutDismissedPolicyCounts(byPolicy = {}, dismissedDetails = []) {
api/policy-alerts.js:182:function withoutDismissedSamples(changedSample = [], dismissedDetails = []) {
api/policy-alerts.js:191:export function reconcilePolicyAlertTrust(alert = {}) {
api/policy-alerts.js:22:function readQueryValue(req, key, fallback = "") {
api/policy-alerts.js:28:function readJson(filePath, fallback = {}) {
api/policy-alerts.js:313:function resolveRulebookStatus(value, changedCount) {
api/policy-alerts.js:319:function resolveStatusAndState({ status = "", state = "", strictEligible = true } = {}) {
api/policy-alerts.js:327:function resolveStrictEligible(value, status = "", state = "") {
api/policy-alerts.js:334:function normalizeState(value = "") {
api/policy-alerts.js:341:function normalizeDateOnly(value = "") {
api/policy-alerts.js:347:function defaultAllowFileFallback(env = process.env) {
api/policy-alerts.js:352:function toAlertObjectFromDailyRow(row = {}) {
api/policy-alerts.js:37:function parseLimit(rawValue, fallback = 20) {
api/policy-alerts.js:406:function toAlertObjectFromFeedEntry(entry = {}, fallbackStatus = "confirmed") {
api/policy-alerts.js:43:function parseIncludeZero(rawValue, fallback = true) {
api/policy-alerts.js:455:function buildSuccessPayload({
api/policy-alerts.js:482:function filterByDateRange(alerts = [], dateFrom = "", dateTo = "") {
api/policy-alerts.js:492:function sortAlertsNewest(alerts = []) {
api/policy-alerts.js:500:function filterByIncludeZero(alerts = [], includeZero = true) {
api/policy-alerts.js:505:function filterByState(alerts = [], state = "confirmed") {
api/policy-alerts.js:51:function parseBooleanFlag(rawValue, fallback = false) {
api/policy-alerts.js:521:function mergeAlertsByIdentity(...alertGroups) {
api/policy-alerts.js:530:function loadAlertsFromFiles({ state = "confirmed", dateFrom = "", dateTo = "", limit = 20, includeZero = true } = {}) {
api/policy-alerts.js:547:async function loadAlertsFromSupabase({
api/policy-alerts.js:59:function toNumber(value, fallback = 0) {
api/policy-alerts.js:641:export default async function handler(req, res) {
api/policy-alerts.js:64:function normalizeSampleDetails(value) {
api/policy-alerts.js:73:function eventDateUtc(event = {}) {
api/policy-alerts.js:80:function toSampleDetailFromEvent(event = {}) {
api/policy-fetch-hook.js:104:function toJinaMirrorUrl(url) {
api/policy-fetch-hook.js:113:function toLimitedText(value) {
api/policy-fetch-hook.js:120:async function fetchTextOnce(url, timeoutMs, userAgent, method = "GET") {
api/policy-fetch-hook.js:171:function parseJson(value) {
api/policy-fetch-hook.js:179:function classifyCloudflareBrowserRunError(statusCode, payload) {
api/policy-fetch-hook.js:17:function normalizeHeaderValue(value) {
api/policy-fetch-hook.js:193:async function fetchViaCloudflareBrowserRun(targetUrl, timeoutMs) {
api/policy-fetch-hook.js:22:function readHeader(req, name = "") {
api/policy-fetch-hook.js:267:async function fetchViaBrowserless(targetUrl, timeoutMs) {
api/policy-fetch-hook.js:334:async function fetchViaDirect(targetUrl, timeoutMs) {
api/policy-fetch-hook.js:33:function readBearerToken(req) {
api/policy-fetch-hook.js:345:async function fetchViaJinaMirror(targetUrl, timeoutMs) {
api/policy-fetch-hook.js:356:export default async function handler(req, res) {
api/policy-fetch-hook.js:42:function readInboundHookToken(req) {
api/policy-fetch-hook.js:46:function safeEqualToken(left, right) {
api/policy-fetch-hook.js:56:function sendJson(res, statusCode, payload) {
api/policy-fetch-hook.js:62:function clampTimeout(value) {
api/policy-fetch-hook.js:68:function clampCloudflareCacheTtl(value) {
api/policy-fetch-hook.js:77:function parseBody(req) {
api/policy-fetch-hook.js:90:function parseAllowlist(value) {
api/policy-fetch-hook.js:97:function isHostAllowed(hostname, allowlist) {
api/policy-mcp.js:8:export default createMcpHandler({
api/return-mcp.js:58:function formatTextMessage(payload) {
api/return-mcp.js:68:export default createMcpHandler({
api/rulebook-attestation-keys.js:13:export default async function handler(req, res) {
api/rulebook-attestation-keys.js:6:function sendJson(res, statusCode, payload) {
api/track.js:118:export default async function handler(req, res) {
api/track.js:39:function send(res, status, payload) {
api/track.js:45:async function readJson(req) {
api/track.js:55:function getAllowedOriginsFromEnv() {
api/track.js:66:function parseOrigin(rawOrigin) {
api/track.js:75:function isAllowedOrigin(rawOrigin) {
api/track.js:88:function isAllowedEvent(event) {
api/track.js:94:function sanitizeProps(rawProps) {
api/trial-mcp.js:66:function formatTextMessage(payload) {
api/trial-mcp.js:76:export default createMcpHandler({
api/v1/[policy]/[action].js:14:function first(value) {
api/v1/[policy]/[action].js:18:function normalize(value) {
api/v1/[policy]/[action].js:22:function readPathParam(req, query, key, pathIndex) {
api/v1/[policy]/[action].js:31:function json(res, statusCode, payload) {
api/v1/[policy]/[action].js:37:export default async function v1PolicyDispatcher(req, res) {
api/v1/workflows/zendesk/[workflow].js:14:function first(value) {
api/v1/workflows/zendesk/[workflow].js:18:function normalize(value) {
api/v1/workflows/zendesk/[workflow].js:22:function readWorkflowParam(req, query) {
api/v1/workflows/zendesk/[workflow].js:31:function json(res, statusCode, payload) {
api/v1/workflows/zendesk/[workflow].js:37:export default async function zendeskWorkflowDispatcher(req, res) {
client/refund-auditor.js:27:async function checkRefundEligibility(vendor, daysSincePurchase, qualifyingConditionsMet) {
lib/async-work-pool.js:1:export async function mapWithConcurrency(items, concurrency, mapper, options = {}) {
lib/async-work-pool.js:23:  async function runWorker(workerIndex) {
lib/blocked-fetch-reuse-cache.js:10:export function createBlockedFetchReuseCache({ isReusableFailure = isBlockedFetchFailure } = {}) {
lib/blocked-fetch-reuse-cache.js:1:function isBlockedFetchFailure(value) {
lib/blocked-fetch-reuse-cache.js:22:  const validateKey = (key) => {
lib/cancel-compute.js:101:export function compute({ vendor, region, plan, billing_cadence }, { requireCompleteContext = true, evidenceSnapshot = null, now = new Date() } = {}) {
lib/cancel-compute.js:268:export function getSupportedVendors() {
lib/cancel-compute.js:26:function withSource(result, vendor) {
lib/cancel-compute.js:275:export function getRulesVersion() {
lib/cancel-compute.js:40:function withRulebook(result, vendor, rulebookResult) {
lib/cancel-compute.js:52:export function validateInput({ vendor, region, plan, billing_cadence }) {
lib/cancel-rulebook.js:12:export function evaluateCancelPolicyRulebook(inputs) {
lib/compliance-export.js:109:function escapeCsv(value) {
lib/compliance-export.js:115:function toCsv(rows) {
lib/compliance-export.js:119:export function buildComplianceSnapshot(now = new Date()) {
lib/compliance-export.js:187:export function snapshotToCsv(snapshot) {
lib/compliance-export.js:50:function readJson(filePath, fallback = {}) {
lib/compliance-export.js:59:function asObject(value) {
lib/compliance-export.js:63:function asText(value) {
lib/compliance-export.js:67:function normalizeSource(entry) {
lib/compliance-export.js:80:function normalizeCandidate(entry) {
lib/compliance-export.js:94:function loadPolicySet(config) {
lib/gemini-model-routing.js:56:export function resolveGeminiModelLadder({ env = process.env } = {}) {
lib/gemini-model-routing.js:5:export function resolveGeminiRuntimePolicy({ env = process.env } = {}) {
lib/gemini-request-policy.js:16:function lowerOnlyInteger(value, fallback, min, hardMax) {
lib/gemini-request-policy.js:22:export function resolveGeminiRequestPolicy({ mode = "single", env = process.env } = {}) {
lib/gemini-usage-budget.js:112:async function runEval({ config, script, keys, args, fetchImpl = globalThis.fetch }) {
lib/gemini-usage-budget.js:138:function usageFromResult(result) {
lib/gemini-usage-budget.js:146:function denialReason(value) {
lib/gemini-usage-budget.js:154:export async function reserveGeminiUsage({
lib/gemini-usage-budget.js:202:export async function releaseGeminiUsage(reservation, {
lib/gemini-usage-budget.js:53:function asLowerOnlyCap(value, hardCap) {
lib/gemini-usage-budget.js:60:function periodKeys(now) {
lib/gemini-usage-budget.js:77:function normalizeStoreUrl(value) {
lib/gemini-usage-budget.js:81:export function resolveGeminiUsageBudgetConfig({ env = process.env, now = Date.now() } = {}) {
lib/json-schema-lite.js:19:function validateNode(value, schema, path, errors) {
lib/json-schema-lite.js:1:function describeValue(value) {
lib/json-schema-lite.js:71:export function validateJsonSchema(value, schema) {
lib/json-schema-lite.js:7:function matchesType(value, type) {
lib/json-schema-subset.js:18:function valuesEqual(left, right) {
lib/json-schema-subset.js:1:function isPlainObject(value) {
lib/json-schema-subset.js:22:function resolveLocalSchemaRef(rootSchema, ref) {
lib/json-schema-subset.js:33:function valueType(value) {
lib/json-schema-subset.js:41:function schemaTypeMatches(value, expectedType) {
lib/json-schema-subset.js:50:function error(path, message) {
lib/json-schema-subset.js:58:export function validateJsonSchemaSubset(value, schema, options = {}) {
lib/json-schema-subset.js:5:function hasOwn(source, key) {
lib/json-schema-subset.js:9:function canonicalJson(value) {
lib/lineage.js:15:export function buildSourceHash(payload) {
lib/lineage.js:20:export function buildPolicySourceHash({
lib/lineage.js:38:export function withLineage(payload, { policyVersion = "unknown", sourceHash = "unknown", evaluatedAt } = {}) {
lib/lineage.js:3:function toIso(value = new Date()) {
lib/lineage.js:8:function stableStringify(value) {
lib/log.js:3:export async function persistLog(event, data) {
lib/mcp-adoption-report.js:105:function toolSummary(tool) {
lib/mcp-adoption-report.js:116:function breakdownSummary(field, value) {
lib/mcp-adoption-report.js:127:function recordBreakdown(map, field, rawValue, classification) {
lib/mcp-adoption-report.js:138:function sortedBreakdowns(map, field) {
lib/mcp-adoption-report.js:146:function classificationSummary(events = []) {
lib/mcp-adoption-report.js:171:export function buildMcpAdoptionReport({ events = [], generatedAt = new Date().toISOString() } = {}) {
lib/mcp-adoption-report.js:270:function adoptionTrendPeriod(events, window, generatedAt) {
lib/mcp-adoption-report.js:282:function adoptionDelta(current, previous, field) {
lib/mcp-adoption-report.js:286:function adoptionTrendWindowObserved(period) {
lib/mcp-adoption-report.js:290:function adoptionTrendComparison(current, previous) {
lib/mcp-adoption-report.js:306:export function buildMcpAdoptionTrend({
lib/mcp-adoption-report.js:329:  const inWindow = (event, sinceTime, endTime) => {
lib/mcp-adoption-report.js:36:function text(value = "") {
lib/mcp-adoption-report.js:40:function dayFromTimestamp(value = "") {
lib/mcp-adoption-report.js:45:function latestTimestamp(left = "", right = "") {
lib/mcp-adoption-report.js:53:function normalizedClient(value = "") {
lib/mcp-adoption-report.js:58:function clientAttributionKey(event = {}) {
lib/mcp-adoption-report.js:64:function buildClientHints(events = []) {
lib/mcp-adoption-report.js:77:function resolveClient(event = {}, clientHints = new Map()) {
lib/mcp-adoption-report.js:91:export function classifyMcpAdoptionEvent(event = {}) {
lib/mcp-adoption-store.js:12:function positiveInteger(value, fallback) {
lib/mcp-adoption-store.js:17:export async function fetchPolicyMcpEvents(config, { since, maxRows = 10000 } = {}) {
lib/mcp-adoption-store.js:51:export async function getMcpAdoptionReport({
lib/mcp-distribution-health.js:13:function hasCompleteToolMetadata(tools = []) {
lib/mcp-distribution-health.js:21:function registryServers(payload = {}) {
lib/mcp-distribution-health.js:27:export function buildMcpDistributionHealthReport({
lib/mcp-distribution-health.js:8:function sameStringSet(left = [], right = []) {
lib/mcp-distribution-health.js:9:  const normalize = (values) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort();
lib/mcp-handler.js:101:  return async function mcpHandler(req, res) {
lib/mcp-handler.js:144:    const recordTelemetry = (method, details = {}) => {
lib/mcp-handler.js:19:function send(res, status, payload) {
lib/mcp-handler.js:25:async function readJson(req) {
lib/mcp-handler.js:36:function ok(id, result) {
lib/mcp-handler.js:40:function err(id, code, message, data) {
lib/mcp-handler.js:44:function defaultIsError(payload) {
lib/mcp-handler.js:48:function getAllowedBrowserOrigins() {
lib/mcp-handler.js:57:function isAllowedBrowserOrigin(rawOrigin) {
lib/mcp-handler.js:76:export function createMcpHandler(config) {
lib/mcp-telemetry.js:22:function classifyClient(userAgent = "", clientName = "") {
lib/mcp-telemetry.js:27:function enabled(value = "") {
lib/mcp-telemetry.js:31:function trafficClass(headers = {}, internalProbeToken = "") {
lib/mcp-telemetry.js:44:function persistedEvent(event = {}) {
lib/mcp-telemetry.js:61:export function buildMcpTelemetryEvent({
lib/mcp-telemetry.js:8:function classifyClientValue(value = "") {
lib/mcp-telemetry.js:93:export async function persistMcpTelemetryEvent(event = {}, {
lib/metrics-axiom.js:10:function parseAxiomRows(payload) {
lib/metrics-axiom.js:1:function toUnixSeconds(ms) {
lib/metrics-axiom.js:27:export async function getAxiomMetricsSnapshot() {
lib/metrics-axiom.js:5:function safeNumber(value) {
lib/metrics-store.js:18:export function recordClientEvent(eventName, ts = Date.now()) {
lib/metrics-store.js:33:export function recordVendorRequest(vendorName, ts = Date.now()) {
lib/metrics-store.js:46:export function getMetricsSnapshot() {
lib/metrics-store.js:5:function getStore() {
lib/policy-context.js:1:export function resolveQualifyingConditionContext({
lib/policy-coverage-scorecard.js:107:function countByCandidateMetadata(candidates, key) {
lib/policy-coverage-scorecard.js:115:function validateCandidateUrl({
lib/policy-coverage-scorecard.js:138:function buildCandidateCoverage(candidateRegistry = {}, lifecycleReport = {}) {
lib/policy-coverage-scorecard.js:168:export function validatePolicyVendorCandidateRegistry(candidateRegistry = {}, admittedVendorIds = new Set()) {
lib/policy-coverage-scorecard.js:231:export function buildPolicyCoverageScorecard({
lib/policy-coverage-scorecard.js:24:function toFinitePositiveNumber(value, fallback) {
lib/policy-coverage-scorecard.js:292:export function formatPolicyCoverageScorecardMarkdown(scorecard = {}) {
lib/policy-coverage-scorecard.js:29:function percent(value, target) {
lib/policy-coverage-scorecard.js:34:function productionVendorIds(rulebooks = {}) {
lib/policy-coverage-scorecard.js:42:function decisionModeFor(policy, config = {}) {
lib/policy-coverage-scorecard.js:49:function buildPolicyDepth(rulebooks = {}) {
lib/policy-coverage-scorecard.js:78:function buildSourceCoverage(sourceMaps = {}) {
lib/policy-decision-material.js:12:export function attachPolicyDecisionMaterial(result, { rulebook, inputs } = {}) {
lib/policy-decision-material.js:36:export function exposePolicyDecisionMaterial(req, payload) {
lib/policy-decision-material.js:3:function readHeader(req, name) {
lib/policy-evidence-snapshot.js:105:  const promise = (async () => {
lib/policy-evidence-snapshot.js:114:      const operation = (async () => {
lib/policy-evidence-snapshot.js:20:const sha256 = (value) => createHash("sha256").update(value).digest("hex");
lib/policy-evidence-snapshot.js:22:export function readPolicyEvidenceCatalog() {
lib/policy-evidence-snapshot.js:41:export function buildPolicyEvidenceSnapshot(report, catalog = CATALOG) {
lib/policy-evidence-snapshot.js:65:function decodeArtifact(row, now) {
lib/policy-evidence-snapshot.js:95:export async function loadPolicyEvidenceSnapshot(options = {}) {
lib/policy-freshness.js:36:export function buildPolicyFreshnessReport({
lib/policy-freshness.js:3:function parseDate(value) {
lib/policy-freshness.js:8:export function evaluatePolicyFreshness({
lib/policy-funnel-report.js:166:function observed(period) {
lib/policy-funnel-report.js:170:function comparison(current, previous) {
lib/policy-funnel-report.js:185:function stageDeltas(current, previous) {
lib/policy-funnel-report.js:192:function eventsInWindow(events, sinceTime, untilTime) {
lib/policy-funnel-report.js:199:export function buildPolicyFunnelReport({
lib/policy-funnel-report.js:37:function text(value = "") {
lib/policy-funnel-report.js:41:function stageForEvent(eventName = "") {
lib/policy-funnel-report.js:48:function latestTimestamp(left = "", right = "") {
lib/policy-funnel-report.js:56:function emptyStage() {
lib/policy-funnel-report.js:60:function stageMap() {
lib/policy-funnel-report.js:64:function percentage(numerator, denominator) {
lib/policy-funnel-report.js:71:function evaluatorCallerIds(mcpEvents = []) {
lib/policy-funnel-report.js:82:function sourceSummary(source = "direct") {
lib/policy-funnel-report.js:94:function summarizePeriod(events = [], mcpEvents = [], { evaluatorDataAvailable = true } = {}) {
lib/policy-funnel-telemetry.js:113:export async function persistPolicyFunnelEvent(event, {
lib/policy-funnel-telemetry.js:33:function enabled(value = "") {
lib/policy-funnel-telemetry.js:37:function token(value = "", maxLength = 80) {
lib/policy-funnel-telemetry.js:46:function pagePath(value = "") {
lib/policy-funnel-telemetry.js:51:function verdict(value = "") {
lib/policy-funnel-telemetry.js:59:function persistedEvent(event = {}) {
lib/policy-funnel-telemetry.js:76:export function isPolicyFunnelEvent(event = "") {
lib/policy-funnel-telemetry.js:80:export function buildPolicyFunnelEvent({
lib/policy-growth-store.js:16:function positiveInteger(value, fallback) {
lib/policy-growth-store.js:21:export async function fetchPolicyFunnelEvents(config, { since, maxRows = 10000 } = {}) {
lib/policy-growth-store.js:53:export async function getPolicyGrowthReports({
lib/policy-mcp-metadata.js:11:export function buildPolicyMcpOutputSchema(verdicts, properties = {}) {
lib/policy-mcp-metadata.js:68:export function buildPolicyRegistryServer() {
lib/policy-mcp-metadata.js:83:export function buildPolicyMcpServerCard(tools) {
lib/policy-request-binding.cjs:13:function bindPolicyRequest(policy, input = {}) {
lib/policy-request-binding.cjs:23:function policyRequestMatchesInputs(policy, request, inputs) {
lib/policy-request-binding.cjs:8:function canonicalJson(value) {
lib/policy-review.js:14:export function buildPolicyReviewUpdate({
lib/policy-review.js:8:function requiredString(value, label) {
lib/policy-runtime-evidence.js:2:export function evaluatePolicyEvidence({ policy, vendor, snapshot, sourceHash, policyVersion, sourceUrl, verifiedAt, now = new Date() }) {
lib/policy-state-integrity.js:4:export function validatePolicyStateArtifacts(rows, allowedPaths, now = new Date()) {
lib/policy-supabase.js:107:export async function supabaseUpsertRows(config, tableName, rows = [], onConflictColumns = []) {
lib/policy-supabase.js:13:export function getPolicySupabaseConfig(env = process.env) {
lib/policy-supabase.js:1:function toFlag(value, fallback = false) {
lib/policy-supabase.js:31:function buildUrl(baseUrl, path, params = {}) {
lib/policy-supabase.js:47:function buildHeaders(config, { json = true, prefer = "" } = {}) {
lib/policy-supabase.js:61:export async function supabaseRestRequest(config, { method = "GET", path = "", params = {}, body, prefer = "" } = {}) {
lib/policy-supabase.js:7:function normalizeUrl(value = "") {
lib/policy-vendor-candidate-monitor.js:114:function responseHeader(response, name) {
lib/policy-vendor-candidate-monitor.js:118:function assertCandidateContent(text, source = {}) {
lib/policy-vendor-candidate-monitor.js:130:async function fetchZendeskArticle({ fetchUrl, fetchImpl, timeoutMs }) {
lib/policy-vendor-candidate-monitor.js:157:async function fetchOfficialDocument({ fetchUrl, fetchImpl, timeoutMs }) {
lib/policy-vendor-candidate-monitor.js:191:export async function monitorPolicyVendorCandidates({
lib/policy-vendor-candidate-monitor.js:20:function clone(value) {
lib/policy-vendor-candidate-monitor.js:24:function normalizeText(value) {
lib/policy-vendor-candidate-monitor.js:40:function contentHash(value) {
lib/policy-vendor-candidate-monitor.js:44:export function toObservationSlot(now = new Date(), intervalHours = 6) {
lib/policy-vendor-candidate-monitor.js:52:function validateSourceUrl(sourceUrl, allowedHosts) {
lib/policy-vendor-candidate-monitor.js:62:function updatePolicyState(previous = {}, observation, observationWindow) {
lib/policy-vendor-lifecycle.js:16:function parseDate(value) {
lib/policy-vendor-lifecycle.js:181:function aggregateMonitoredVendors(rows) {
lib/policy-vendor-lifecycle.js:204:export function buildPolicyVendorLifecycleReport({
lib/policy-vendor-lifecycle.js:21:function ageDays(value, now) {
lib/policy-vendor-lifecycle.js:274:export function formatPolicyVendorLifecycleMarkdown(report = {}) {
lib/policy-vendor-lifecycle.js:28:function normalizeAdmission(registry = {}) {
lib/policy-vendor-lifecycle.js:47:export function evaluateMonitoredVendorPolicy(row = {}, {
lib/policy-vendor-lifecycle.js:84:function evaluateCandidatePolicy({
lib/privacy-identifiers.js:3:export function buildPseudonymousCallerId(value = "", salt = "") {
lib/rate-limit.js:108:export function addRateLimitHeaders(res, result) {
lib/rate-limit.js:11:export function createRateLimiter(requests, window) {
lib/rate-limit.js:16:  return function checkRateLimit(identifier) {
lib/rate-limit.js:74:export function getClientIp(req) {
lib/rate-limit.js:86:export function sendRateLimitError(res, result, request_id) {
lib/refund-compute.js:133:export function compute(
lib/refund-compute.js:27:function withSource(result, vendor) {
lib/refund-compute.js:294:export function getSupportedVendors() {
lib/refund-compute.js:301:export function getRulesVersion() {
lib/refund-compute.js:41:function withRulebook(result, vendor, rulebookResult) {
lib/refund-compute.js:53:export function validateInput({ vendor, days_since_purchase, region, plan, qualifying_conditions_met }) {
lib/refund-rulebook.js:12:export function evaluateRefundPolicyRulebook(inputs) {
lib/request-query.js:3:export function parseRequestQuery(request) {
lib/return-compute.js:132:export function compute(
lib/return-compute.js:27:function withSource(result, vendor) {
lib/return-compute.js:317:export function getSupportedVendors() {
lib/return-compute.js:324:export function getRulesVersion() {
lib/return-compute.js:41:function withRulebook(result, vendor, rulebookResult) {
lib/return-compute.js:53:export function validateInput({ vendor, days_since_purchase, region, plan, qualifying_conditions_met }) {
lib/return-rulebook.js:12:export function evaluateReturnPolicyRulebook(inputs) {
lib/routes/v1/policies/cancel-penalty.js:19:function rid() {
lib/routes/v1/policies/cancel-penalty.js:23:async function readJson(req) {
lib/routes/v1/policies/cancel-penalty.js:34:export default async function handler(req, res) {
lib/routes/v1/policies/cancel-penalty.js:9:function json(res, statusCode, payload) {
lib/routes/v1/policies/refund-eligibility.js:10:function json(res, statusCode, payload) {
lib/routes/v1/policies/refund-eligibility.js:20:function rid() {
lib/routes/v1/policies/refund-eligibility.js:25:function isProbablyYou(req) {
lib/routes/v1/policies/refund-eligibility.js:30:async function readJson(req) {
lib/routes/v1/policies/refund-eligibility.js:41:export default async function handler(req, res) {
lib/routes/v1/policies/return-eligibility.js:19:function rid() {
lib/routes/v1/policies/return-eligibility.js:23:async function readJson(req) {
lib/routes/v1/policies/return-eligibility.js:34:export default async function handler(req, res) {
lib/routes/v1/policies/return-eligibility.js:9:function json(res, statusCode, payload) {
lib/routes/v1/policies/trial-terms.js:19:function rid() {
lib/routes/v1/policies/trial-terms.js:23:async function readJson(req) {
lib/routes/v1/policies/trial-terms.js:34:export default async function handler(req, res) {
lib/routes/v1/policies/trial-terms.js:9:function json(res, statusCode, payload) {
lib/routes/v1/workflows/zendesk/cancel.js:32:export default createZendeskWorkflowHandler({
lib/routes/v1/workflows/zendesk/cancel.js:4:function buildAction({ decisionClass, policy }) {
lib/routes/v1/workflows/zendesk/refund.js:28:export default createZendeskWorkflowHandler({
lib/routes/v1/workflows/zendesk/refund.js:4:function buildAction({ decisionClass, policy }) {
lib/routes/v1/workflows/zendesk/return.js:28:export default createZendeskWorkflowHandler({
lib/routes/v1/workflows/zendesk/return.js:4:function buildAction({ decisionClass, policy }) {
lib/routes/v1/workflows/zendesk/trial.js:28:export default createZendeskWorkflowHandler({
lib/routes/v1/workflows/zendesk/trial.js:4:function buildAction({ decisionClass, policy }) {
lib/routes/v1/workflows/zendesk/workflow-common.js:111:function allowsDecisionOverride(env = process.env) {
lib/routes/v1/workflows/zendesk/workflow-common.js:115:function buildDecideAuthHeaders() {
lib/routes/v1/workflows/zendesk/workflow-common.js:131:function parseDays(value) {
lib/routes/v1/workflows/zendesk/workflow-common.js:137:function buildIdempotencyKey(payload) {
lib/routes/v1/workflows/zendesk/workflow-common.js:13:function json(res, statusCode, payload) {
lib/routes/v1/workflows/zendesk/workflow-common.js:155:function createReq({
lib/routes/v1/workflows/zendesk/workflow-common.js:178:function createRes() {
lib/routes/v1/workflows/zendesk/workflow-common.js:192:async function invokeJson(handler, reqOptions) {
lib/routes/v1/workflows/zendesk/workflow-common.js:203:function buildZendeskTags({
lib/routes/v1/workflows/zendesk/workflow-common.js:228:function buildPrivateNote({
lib/routes/v1/workflows/zendesk/workflow-common.js:23:async function readJson(req) {
lib/routes/v1/workflows/zendesk/workflow-common.js:261:export function createZendeskWorkflowHandler(config) {
lib/routes/v1/workflows/zendesk/workflow-common.js:282:  function pruneIdempotencyCache(now) {
lib/routes/v1/workflows/zendesk/workflow-common.js:290:  return async function zendeskWorkflowHandler(req, res) {
lib/routes/v1/workflows/zendesk/workflow-common.js:34:function normalizeText(value, maxLen = 500) {
lib/routes/v1/workflows/zendesk/workflow-common.js:39:function normalizeDecision(value) {
lib/routes/v1/workflows/zendesk/workflow-common.js:45:function parseFlag(value) {
lib/routes/v1/workflows/zendesk/workflow-common.js:50:function readHeader(req, name) {
lib/routes/v1/workflows/zendesk/workflow-common.js:60:function safeEqualToken(left, right) {
lib/routes/v1/workflows/zendesk/workflow-common.js:70:function isProductionDeployment(env = process.env) {
lib/routes/v1/workflows/zendesk/workflow-common.js:74:function shouldRequireWorkflowAuth(env = process.env) {
lib/routes/v1/workflows/zendesk/workflow-common.js:80:function readBearerToken(req) {
lib/routes/v1/workflows/zendesk/workflow-common.js:86:function getWorkflowAuthState(req, env = process.env) {
lib/routes/v1/workflows/zendesk/workflow-common.js:9:function rid() {
lib/rulebook-attestation-signing.js:123:function resolveKeyHistory(env = process.env) {
lib/rulebook-attestation-signing.js:153:export function isRulebookAttestationSignatureRequired(env = process.env) {
lib/rulebook-attestation-signing.js:159:export function signRulebookAttestationBundleHash(bundleHash, env = process.env) {
lib/rulebook-attestation-signing.js:19:function isPlainObject(value) {
lib/rulebook-attestation-signing.js:200:export function getRulebookAttestationSigningKeys(env = process.env) {
lib/rulebook-attestation-signing.js:23:function normalizePem(value) {
lib/rulebook-attestation-signing.js:257:export function verifyRulebookAttestationSignature({ bundleHash, signature, publicKeyPem } = {}) {
lib/rulebook-attestation-signing.js:27:function base64url(value) {
lib/rulebook-attestation-signing.js:31:function fromBase64url(value) {
lib/rulebook-attestation-signing.js:35:function resolveSigningKey(env = process.env) {
lib/rulebook-attestation-signing.js:67:function normalizeOptionalTimestamp(value, field, index) {
lib/rulebook-attestation-signing.js:76:function normalizeHistoryKey(entry, index) {
lib/rulebook-attestation.js:10:function canonicalJson(value) {
lib/rulebook-attestation.js:19:function sha256(value) {
lib/rulebook-attestation.js:23:function normalizeTrustedAdapter(attestation) {
lib/rulebook-attestation.js:40:function normalizeRuntimeBinding(binding) {
lib/rulebook-attestation.js:54:export function buildRulebookAttestation(result = {}) {
lib/rulebook-attestation.js:6:function isPlainObject(value) {
lib/rulebook-runtime-contract.js:105:function buildRulebookRuntimeBinding({ bindingMode = RULEBOOK_DIRECT_BINDING_MODE } = {}) {
lib/rulebook-runtime-contract.js:129:function buildAdvisoryDecisionContract({ mode = "single" } = {}) {
lib/rulebook-runtime-contract.js:12:function readJson(filePath) {
lib/rulebook-runtime-contract.js:145:function buildAdvisoryResponseContractManifest() {
lib/rulebook-runtime-contract.js:155:function buildRulebookRuntimeManifest() {
lib/rulebook-runtime-contract.js:16:function sha256(value) {
lib/rulebook-runtime-contract.js:75:function normalizeRulebookBindingMode(bindingMode = RULEBOOK_DIRECT_BINDING_MODE) {
lib/rulebook-runtime-contract.js:79:function isRulebookBindingModeSupported(bindingMode = RULEBOOK_DIRECT_BINDING_MODE) {
lib/rulebook-runtime-contract.js:83:function findRulebookOutputMaterialPaths(value, { path = "" } = {}) {
lib/rulebook-runtime-contract.js:85:  const visit = (node, currentPath) => {
lib/rulebook-v1.js:108:function validateCondition(condition, path, errors, state, depth = 0) {
lib/rulebook-v1.js:177:function validateRulebook(rulebook) {
lib/rulebook-v1.js:255:function rulebookContract() {
lib/rulebook-v1.js:259:function compareScalar(left, right, operator) {
lib/rulebook-v1.js:26:function isPlainObject(value) {
lib/rulebook-v1.js:277:function evaluateCondition(condition, inputs) {
lib/rulebook-v1.js:304:function normalizeOutcome(outcome) {
lib/rulebook-v1.js:30:function canonicalJson(value) {
lib/rulebook-v1.js:313:function validateInputs(rulebook, inputs) {
lib/rulebook-v1.js:327:export function evaluateRulebookV1({ rulebook, inputs, bindingMode } = {}) {
lib/rulebook-v1.js:39:function sha256(value) {
lib/rulebook-v1.js:43:function hasOwn(source, key) {
lib/rulebook-v1.js:47:function validateAllowedKeys(source, allowedKeys, path, errors) {
lib/rulebook-v1.js:61:function getFieldValue(inputs, path) {
lib/rulebook-v1.js:73:function valueTypeMatches(value, type) {
lib/rulebook-v1.js:84:function validateOutcome(outcome, path, errors) {
lib/successful-fetch-cache.js:19:  const retain = (key, value) => {
lib/successful-fetch-cache.js:1:function isSuccessfulRawFetch(value) {
lib/successful-fetch-cache.js:5:export function createSuccessfulFetchCache({ isSuccess = isSuccessfulRawFetch } = {}) {
lib/trial-compute.js:135:export function compute(
lib/trial-compute.js:26:function withSource(result, vendor) {
lib/trial-compute.js:313:export function getSupportedVendors() {
lib/trial-compute.js:320:export function getRulesVersion() {
lib/trial-compute.js:40:function withRulebook(result, vendor, rulebookResult) {
lib/trial-compute.js:52:export function validateInput({
lib/trial-rulebook.js:12:export function evaluateTrialPolicyRulebook(inputs) {
lib/trusted-adapter-capabilities.js:30:function capabilityDeniedError(name) {
lib/trusted-adapter-capabilities.js:37:function deniedCapability(name) {
lib/trusted-adapter-capabilities.js:43:function installDeniedValue(name, capability) {
lib/trusted-adapter-capabilities.js:53:function installDeniedAccess(name, capability) {
lib/trusted-adapter-capabilities.js:63:export function auditTrustedAdapterImplementation(implementation) {
lib/trusted-adapter-capabilities.js:74:export function installDeniedAmbientCapabilities() {
lib/trusted-adapter-definitions.js:10:function boundedInteger(value, min, max) {
lib/trusted-adapter-definitions.js:114:function krafthausWorkflowReadinessV1(input) {
lib/trusted-adapter-definitions.js:16:function presentText(value, minLength) {
lib/trusted-adapter-definitions.js:20:function solanaExecutionGateV1(input) {
lib/trusted-adapter-definitions.js:411:export function getRegisteredTrustedAdapter(adapterId, version) {
lib/trusted-adapter-definitions.js:415:export function getTrustedAdapterVersionLock(adapterId, version) {
lib/trusted-adapter-definitions.js:48:function decisionMemoReadinessV1(input) {
lib/trusted-adapter-isolation.js:23:    const finish = (result) => {
lib/trusted-adapter-isolation.js:8:export function executeTrustedAdapterIsolated({
lib/trusted-adapter-worker.js:6:function deepFreeze(value) {
lib/trusted-adapters.js:145:function validateAdapterOutput(manifest, output) {
lib/trusted-adapters.js:199:function deepFreeze(value) {
lib/trusted-adapters.js:19:function isPlainObject(value) {
lib/trusted-adapters.js:206:export function getTrustedAdapterManifest(adapterId, version) {
lib/trusted-adapters.js:210:export async function executeTrustedAdapter(invocation) {
lib/trusted-adapters.js:23:function canonicalJson(value) {
lib/trusted-adapters.js:32:function sha256(value) {
lib/trusted-adapters.js:36:function validateAllowedKeys(source, allowed, path, errors) {
lib/trusted-adapters.js:50:function materializedManifest(entry) {
lib/trusted-adapters.js:58:function publicManifest(entry) {
lib/trusted-adapters.js:69:function assertTrustedAdapterVersionLock(manifest) {
lib/trusted-adapters.js:93:function validateAdapterInput(manifest, input) {
scripts/audit-policy-freshness.js:17:function readJson(relativePath) {
scripts/audit-policy-freshness.js:21:function readArgValue(name, fallback = "") {
scripts/check-mcp-distribution.js:16:async function fetchJson(url, options = {}) {
scripts/check-mcp-distribution.js:29:async function rpc(method, id) {
scripts/check-mcp-distribution.js:52:async function settledValue(promise, label, errors) {
scripts/check-policies.js:1012:function writePolicyStatusReports(rows, generatedAtUtc) {
scripts/check-policies.js:1075:function writePolicyVendorLifecycleReports(report) {
scripts/check-policies.js:1080:function writePolicyCoverageScorecard(scorecard) {
scripts/check-policies.js:1085:function toIsoWeekKey(utcIso) {
scripts/check-policies.js:1098:function buildWeeklyTriageSnapshot(rows, generatedAtUtc) {
scripts/check-policies.js:1126:function writeWeeklyTriageReports(rows, generatedAtUtc) {
scripts/check-policies.js:1151:  const delta = (key) => {
scripts/check-policies.js:1195:function readNdjson(filePath) {
scripts/check-policies.js:1215:function toArtifactAbsolutePath(artifactPath = "") {
scripts/check-policies.js:1219:async function hydratePolicyStateArtifactsFromSupabase(supabaseConfig) {
scripts/check-policies.js:1273:async function syncPolicyStateArtifactsToSupabase(supabaseConfig) {
scripts/check-policies.js:1319:function buildSupabasePolicyEventRows(eventLogEntries = [], dateUtc = "") {
scripts/check-policies.js:1350:function buildSupabaseDailyAlertRow(entry = {}, strictEligible = false) {
scripts/check-policies.js:1389:function getAlertContinuityLookbackDays() {
scripts/check-policies.js:1395:function listDateRangeUtc(startDateUtc = "", endDateUtc = "") {
scripts/check-policies.js:1409:async function fetchSupabaseDailyAlertDateSet(supabaseConfig, startDateUtc = "", endDateUtc = "") {
scripts/check-policies.js:1433:function buildSupabaseZeroChangeContinuityRow(dateUtc = "", templateEntry = {}) {
scripts/check-policies.js:1475:async function buildSupabaseContinuityBackfillRows({
scripts/check-policies.js:1499:async function syncPolicyAlertsToSupabase({
scripts/check-policies.js:1549:function buildPolicyEventId(item) {
scripts/check-policies.js:1557:function appendPolicyEventLog(changedItems, generatedAtUtc = utcIsoTimestamp()) {
scripts/check-policies.js:1623:function updateJsonStringField(filePath, fieldName, nextValue) {
scripts/check-policies.js:1638:export function normalizeSourceUrlForComparison(value) {
scripts/check-policies.js:1666:function firstNonEmptyString(values = []) {
scripts/check-policies.js:1673:export function evaluateVendorSourceMigration({
scripts/check-policies.js:1714:function detectFetchInterstitial(text) {
scripts/check-policies.js:1734:function normalizeFetchFailureReasonToken(errorMessage) {
scripts/check-policies.js:1743:function parseFetchFailureSegments(failureReason) {
scripts/check-policies.js:1763:function isImmediateFetchBlockErrorMessage(errorMessage) {
scripts/check-policies.js:1770:function isAuxiliaryFetchFailureSegment(segment) {
scripts/check-policies.js:1777:export function classifyFetchFailureBlock(failureReason) {
scripts/check-policies.js:1811:export function getCandidatePendingModelId(candidate) {
scripts/check-policies.js:1819:export function isLegacyPendingCandidate(candidate) {
scripts/check-policies.js:1823:function getPendingModelFirstObservedUtc(candidate, fallback = "") {
scripts/check-policies.js:1830:function markCandidatePendingModel(candidate, firstObservedUtc) {
scripts/check-policies.js:1838:function decodeHtmlEntities(input) {
scripts/check-policies.js:1850:function escapeRegexLiteral(value) {
scripts/check-policies.js:1854:function getPolicyKeywordRegex(policyType) {
scripts/check-policies.js:1866:function getPolicyKeywords(policyType) {
scripts/check-policies.js:1873:function getVendorKeywordRegex(vendorKey) {
scripts/check-policies.js:1884:function extractVendorStableText(lines, vendorKey) {
scripts/check-policies.js:1904:function extractPolicyFocusedText(lines, policyType) {
scripts/check-policies.js:1927:function normalizeFetchedText(rawText, policyType = "default", vendorKey = "") {
scripts/check-policies.js:1965:function getFetchQualityMinChars() {
scripts/check-policies.js:1970:function getFetchQualityMinLines() {
scripts/check-policies.js:1975:function getFetchQualityMinPolicyHits() {
scripts/check-policies.js:1980:function getQualityGateRejectFailures() {
scripts/check-policies.js:1985:function getFetchQualityThresholds(policyType, vendorKey) {
scripts/check-policies.js:2008:function countPolicyKeywordHits(text, policyType) {
scripts/check-policies.js:2021:function assessFetchQuality({ rawText, normalizedText, policyType, vendorKey = "" }) {
scripts/check-policies.js:2057:function scoreFetchQuality(quality) {
scripts/check-policies.js:2070:function normalizePageMetadata(input = {}) {
scripts/check-policies.js:2090:function toIsoDateOnly(value) {
scripts/check-policies.js:2098:function buildPageMetadataSignature(input) {
scripts/check-policies.js:2119:function extractMetadataText(rawText) {
scripts/check-policies.js:2131:function extractDateLabelFromText(text, labelPattern) {
scripts/check-policies.js:2139:function extractTitleFromText(rawText) {
scripts/check-policies.js:2155:function extractPageMetadata({ rawText, sourceMetadata } = {}) {
scripts/check-policies.js:2180:function normalizeSemanticTokens(tokens) {
scripts/check-policies.js:2188:function semanticTokenSignature(profile) {
scripts/check-policies.js:2193:export function semanticSignaturesStable(previousSignature, nextSignature) {
scripts/check-policies.js:2200:export function buildChangeKey(hashValue, semanticSignature) {
scripts/check-policies.js:2207:export function summarizeDistinctVendorFailures(failures = []) {
scripts/check-policies.js:2219:function getCandidateChangeKey(candidate, fallback = {}) {
scripts/check-policies.js:2241:function getCandidateSignalWindowDecision(candidate) {
scripts/check-policies.js:2251:function extractDurationTokens(text, anchors = [], tokenPrefix = "window_days") {
scripts/check-policies.js:2278:  const addDuration = (rawValue, rawUnit) => {
scripts/check-policies.js:2300:export function extractSemanticTokens(text, policyType = "default") {
scripts/check-policies.js:2305:  const addIfMatch = (token, regex) => {
scripts/check-policies.js:2364:function buildSemanticProfile(text, policyType, metadata = {}) {
scripts/check-policies.js:2383:function normalizeSemanticProfile(input, metadata = {}) {
scripts/check-policies.js:2406:function normalizeConfirmedBaselineEntry(input) {
scripts/check-policies.js:2426:function semanticTokensFromSignature(signature) {
scripts/check-policies.js:2433:function buildComparisonSemanticProfile({ baselineEntry, fallbackProfile }) {
scripts/check-policies.js:2462:function diffSemanticProfiles(previousProfile, nextProfile) {
scripts/check-policies.js:2486:function formatSemanticDiffSummary(semanticDiff) {
scripts/check-policies.js:2496:function buildSemanticDiffSignature(semanticDiff) {
scripts/check-policies.js:2503:function getActualConfirmRuns() {
scripts/check-policies.js:2508:function getActualConfirmRunsForVendor(vendorConfig, vendor, sourceVolatilityTier = "normal") {
scripts/check-policies.js:2530:function getActualMinGapMs() {
scripts/check-policies.js:2536:function getActualMinGapHours() {
scripts/check-policies.js:2541:function getCandidateTtlDays() {
scripts/check-policies.js:2546:function getPendingDetailLimit() {
scripts/check-policies.js:2551:function getSameRunRecheckPasses() {
scripts/check-policies.js:2556:function getSameRunRecheckDelayMs() {
scripts/check-policies.js:2561:function getSameRunRecheckBatchSize(defaultSize = 3) {
scripts/check-policies.js:2566:function getSameRunMajorityMinVotes() {
scripts/check-policies.js:2571:function getCrossRunWindowSize() {
scripts/check-policies.js:2576:function getCrossRunWindowRequired() {
scripts/check-policies.js:2584:function getAdaptiveWindowEnabled() {
scripts/check-policies.js:2590:function getHighSignalWindowRequired() {
scripts/check-policies.js:2598:function getHighSignalMinPolicyHits() {
scripts/check-policies.js:2603:function getHighSignalMinLines() {
scripts/check-policies.js:2608:export function isHighSignalWindowCandidate({ semanticSignature, quality }) {
scripts/check-policies.js:2618:export function getCrossRunWindowRequiredForCandidate({ semanticSignature, quality }) {
scripts/check-policies.js:2625:function getCrossRunWindowRequirementLabel() {
scripts/check-policies.js:2633:function getStalePendingDays() {
scripts/check-policies.js:2638:function getVolatileFlipThreshold() {
scripts/check-policies.js:2643:function getVolatileRequireRecentFlip() {
scripts/check-policies.js:2649:function getEscalationPendingDays() {
scripts/check-policies.js:2654:function getEscalationFlipThreshold() {
scripts/check-policies.js:2659:function getEscalationRequireRecentFlip() {
scripts/check-policies.js:2665:function getFetchFailureQuarantineStreak() {
scripts/check-policies.js:2670:function getFallbackSignalConsecutiveRuns() {
scripts/check-policies.js:2675:function getEscalationFlipThresholdForVendor(policyName, vendor, sourceVolatilityTier = "normal") {
scripts/check-policies.js:2698:export function getVolatileFlipThresholdForVendor(policyName, vendor, sourceVolatilityTier = "normal") {
scripts/check-policies.js:2721:function getNoConfirmEscalationDays() {
scripts/check-policies.js:2726:function getMaterialCooldownDays() {
scripts/check-policies.js:2731:function getMaterialOscillationWindowDays() {
scripts/check-policies.js:2736:function getCandidatePendingSinceUtc(candidate) {
scripts/check-policies.js:2747:function getCandidateAgeDays(candidate, nowMs = Date.now()) {
scripts/check-policies.js:2755:function toMsOrNaN(isoValue) {
scripts/check-policies.js:2760:function appendSignalWindow(coverageEntry, signal) {
scripts/check-policies.js:2773:export function countSignalWindowChangeFlips(signalWindow) {
scripts/check-policies.js:2789:export function evaluateSignalWindow(signalWindow, requiredVotes = getCrossRunWindowRequired()) {
scripts/check-policies.js:2823:function getRunMajorityDecision(observations) {
scripts/check-policies.js:2860:function sortedLimitedVendors(vendors, limit = getPendingDetailLimit()) {
scripts/check-policies.js:2865:function isStaleCandidate(candidate, nowMs = Date.now()) {
scripts/check-policies.js:2878:export async function fetchText(url, attempts = 3) {
scripts/check-policies.js:2917:function normalizeFallbackProbeHeaderValue(value) {
scripts/check-policies.js:2921:function getFallbackProbeHeader(headers, key) {
scripts/check-policies.js:2926:function buildFallbackProbeEntrySignatures(entry) {
scripts/check-policies.js:2957:export function evaluateFallbackSignalTransition({
scripts/check-policies.js:3006:async function probeHeadMetadata(url, attempts = 2) {
scripts/check-policies.js:3070:async function probeFallbackMetadata(vendorConfig) {
scripts/check-policies.js:3143:function sanitizeBrowserHookDiagnostic(value, fallback) {
scripts/check-policies.js:3152:export function summarizeBrowserHookFailure(statusCode, payload) {
scripts/check-policies.js:3167:async function fetchBrowserHookText({ url, vendor, policyType }, attempts = 1) {
scripts/check-policies.js:3265:function toJinaMirrorUrl(url) {
scripts/check-policies.js:3274:export function toZendeskHelpCenterApiTarget(url) {
scripts/check-policies.js:3305:async function fetchZendeskHelpCenterJson(apiTarget, attempts = 2) {
scripts/check-policies.js:3401:function buildCandidateUrls(vendorConfig) {
scripts/check-policies.js:3419:async function performFetchLane({ lane, candidateUrl, context }) {
scripts/check-policies.js:3495:function normalizeFetchCacheUrl(candidateUrl) {
scripts/check-policies.js:3507:function buildRawFetchCacheKey(lane, candidateUrl) {
scripts/check-policies.js:3511:export function buildBlockedFetchPlanKey(vendor, vendorConfig) {
scripts/check-policies.js:3522:export function buildPolicyFetchSchedule(
scripts/check-policies.js:353:function hash(text) {
scripts/check-policies.js:3563:async function attemptFetchLane({
scripts/check-policies.js:3570:  const loader = () => performFetchLane({ lane, candidateUrl, context });
scripts/check-policies.js:357:function sha256Hex(text = "") {
scripts/check-policies.js:3580:async function fetchWithFallback(
scripts/check-policies.js:361:function readJson(filePath, fallback = {}) {
scripts/check-policies.js:3680:export async function checkPolicySet({
scripts/check-policies.js:370:function sleep(ms) {
scripts/check-policies.js:374:export function createMinIntervalScheduler({ minIntervalMs = 0, sleepFn = sleep, nowFn = Date.now } = {}) {
scripts/check-policies.js:379:  return function schedule(task) {
scripts/check-policies.js:3870:  const ensureCoverageEntry = (vendor) => {
scripts/check-policies.js:3877:  const markSuccessfulFetch = (vendor, whenUtc, fetchLane = "") => {
scripts/check-policies.js:3885:  const markConfirmedChange = (vendor, whenUtc) => {
scripts/check-policies.js:3890:  const getConfiguredSourceUrl = (vendorConfig) => {
scripts/check-policies.js:3900:  const getVendorVolatilityTier = (vendorConfig, sourceUrl = "") => {
scripts/check-policies.js:3936:  const clearBlockedRetryQueueEntry = (vendor) => {
scripts/check-policies.js:400:function jitter(ms) {
scripts/check-policies.js:406:function normalizeFetchLane(value) {
scripts/check-policies.js:410:function normalizeFetchLaneList(values) {
scripts/check-policies.js:423:function parseFetchLaneCsv(value) {
scripts/check-policies.js:427:function getDefaultFetchLanes() {
scripts/check-policies.js:436:function getVendorFetchLanes(vendorConfig) {
scripts/check-policies.js:442:function normalizeTier1VendorList(value) {
scripts/check-policies.js:455:function loadTier1VendorsConfig() {
scripts/check-policies.js:465:function getTier1TargetForPolicy(policyType, availableVendors, tier1Config) {
scripts/check-policies.js:475:function utcIsoTimestamp(date = new Date()) {
scripts/check-policies.js:479:export function applyMonitorSourceCheckMetadata(
scripts/check-policies.js:496:function parseDateOnlyToUtc(value = "") {
scripts/check-policies.js:504:function toDateOnlyUtc(date = new Date()) {
scripts/check-policies.js:508:function addUtcDays(value = "", days = 0) {
scripts/check-policies.js:515:function toZeroPolicyCounts() {
scripts/check-policies.js:519:function buildZeroChangeContinuityAlert(dateUtc = "") {
scripts/check-policies.js:5524:async function main() {
scripts/check-policies.js:565:function summarizePolicyCounts(changedItems) {
scripts/check-policies.js:574:function toPolicyCountObject(changedItems) {
scripts/check-policies.js:584:function getPolicyAlertFeedMaxEntries() {
scripts/check-policies.js:5890:  const toPolicyCountString = (items) => Object.entries(summarizePolicyCounts(items))
scripts/check-policies.js:590:function getPolicyAlertIncludeZeroChange() {
scripts/check-policies.js:595:function buildRunUrl() {
scripts/check-policies.js:602:function sortAlertsByGeneratedUtcDesc(alerts = []) {
scripts/check-policies.js:610:function removeAlertsForDate(alerts = [], dateUtc = "") {
scripts/check-policies.js:616:function upsertDailyAlert(alerts = [], dailyEntry = {}, maxEntries = 120) {
scripts/check-policies.js:623:function collapseAlertsByDate(alerts = []) {
scripts/check-policies.js:636:function ensureAlertDateContinuity(alerts = [], maxEntries = 120) {
scripts/check-policies.js:662:function toDateUtcPrefix(value = "") {
scripts/check-policies.js:668:function normalizeSourceHostname(value = "") {
scripts/check-policies.js:678:function normalizeVolatilityTier(value = "") {
scripts/check-policies.js:684:function inferSourceVolatilityTier(sourceUrl = "") {
scripts/check-policies.js:707:function getSourceVolatilityRule(tier = "normal") {
scripts/check-policies.js:712:export function resolveSourceVolatilityTier(vendorConfig, sourceUrl = "") {
scripts/check-policies.js:720:function normalizeDailyFingerprintEntry(input) {
scripts/check-policies.js:748:function normalizeBlockedRetryEntry(input) {
scripts/check-policies.js:788:function buildComparisonBaselineEntry({ baselineEntry, dailyFingerprintEntry }) {
scripts/check-policies.js:806:function buildDailyPolicyCountsFromEvents(dayEvents = []) {
scripts/check-policies.js:816:export function buildDailyAlertFromEvents(entry = {}, eventLogEntries = []) {
scripts/check-policies.js:874:export function isStrictDailyAlertEntry(entry = {}, { includeZeroChange = true } = {}) {
scripts/check-policies.js:886:export function classifyDailyAlertForPublication(dailyEntry = {}, { includeZeroChange = true } = {}) {
scripts/check-policies.js:915:function updatePolicyAlertFeed(entry, eventLogEntries = [], { includeZeroChange = true } = {}) {
scripts/check-policies.js:990:function summarizeStatusCounts(rows) {
scripts/check-policies.js:999:function summarizePolicyStatusCounts(rows, statuses = []) {
scripts/customer-key-smoke.js:114:function normalizeBaseUrl(value) {
scripts/customer-key-smoke.js:124:function redactKey(key) {
scripts/customer-key-smoke.js:130:async function postJson(url, { key, timeoutMs }) {
scripts/customer-key-smoke.js:157:async function main() {
scripts/customer-key-smoke.js:68:function usage() {
scripts/customer-key-smoke.js:86:function parseArgs(argv) {
scripts/generate-golden-replay-corpus.js:133:async function buildFixture({ id, title, kind, request, notes }) {
scripts/generate-golden-replay-corpus.js:26:function loadJson(...segments) {
scripts/generate-golden-replay-corpus.js:49:function policyFixtureMetadata(policyType, vendor, evidenceNote = "") {
scripts/generate-golden-replay-corpus.js:62:function clone(value) {
scripts/generate-golden-replay-corpus.js:66:function writeJson(fileName, value) {
scripts/generate-golden-replay-corpus.js:70:function conformanceRequest(fileName) {
scripts/generate-golden-replay-corpus.js:74:function rulebookRequest({ rulebookFile, workflow, sourceRecordId, requestedAction, inputs }) {
scripts/generate-golden-replay-corpus.js:94:async function evaluateRequest(request) {
scripts/generate-outbound-domain-inventory.mjs:103:function inferTags(host, ownSuffixes) {
scripts/generate-outbound-domain-inventory.mjs:141:function riskTier(tags, contexts) {
scripts/generate-outbound-domain-inventory.mjs:172:function isCriticalDomain(tags) {
scripts/generate-outbound-domain-inventory.mjs:176:function asSorted(setLike) {
scripts/generate-outbound-domain-inventory.mjs:180:function sampleRefs(entry, maxItems = 3) {
scripts/generate-outbound-domain-inventory.mjs:187:function trimCell(value) {
scripts/generate-outbound-domain-inventory.mjs:191:function renderTableRow(cells) {
scripts/generate-outbound-domain-inventory.mjs:195:function compareAscii(a, b) {
scripts/generate-outbound-domain-inventory.mjs:201:function buildIssuesMarkdown({ timestamp, issues, rawLineCount }) {
scripts/generate-outbound-domain-inventory.mjs:230:function buildInventoryMarkdown({ timestamp, summary, topByOccurrences, criticalHosts, hosts, repo }) {
scripts/generate-outbound-domain-inventory.mjs:310:function main() {
scripts/generate-outbound-domain-inventory.mjs:56:function firstPartySuffixes(repo) {
scripts/generate-outbound-domain-inventory.mjs:64:function cleanUrl(rawUrl) {
scripts/generate-outbound-domain-inventory.mjs:6:function parseArgs(argv) {
scripts/generate-outbound-domain-inventory.mjs:72:function splitCombinedUrls(rawUrl) {
scripts/generate-outbound-domain-inventory.mjs:79:function normalizeHost(hostname) {
scripts/generate-outbound-domain-inventory.mjs:88:function inferContexts(filePath) {
scripts/generate-policy-mcp-metadata.js:20:function writeJson(relativePath, value) {
scripts/generate-policy-mcp-metadata.js:27:function readJson(relativePath) {
scripts/generate-policy-mcp-metadata.js:31:function toUcpInputs(tool) {
scripts/generate-project-inventory.sh:16:FUNC_PATTERN='export default|export async function|export function|function [A-Za-z0-9_]+\(|const [A-Za-z0-9_]+\s*=\s*\([^)]*\)\s*=>|const [A-Za-z0-9_]+\s*=\s*async\s*\([^)]*\)\s*=>'
scripts/lib/policy-feed-reliability.js:100:export function mergePolicyAlertFeed({
scripts/lib/policy-feed-reliability.js:13:function normalizeByPolicy(byPolicyValue) {
scripts/lib/policy-feed-reliability.js:23:function buildByPolicySignature(byPolicy) {
scripts/lib/policy-feed-reliability.js:29:export function normalizeAlertEntry(entry) {
scripts/lib/policy-feed-reliability.js:56:export function buildAlertSignature(entry) {
scripts/lib/policy-feed-reliability.js:76:export function isLowSignalAlert(entry, { lowSignalThreshold = DEFAULT_LOW_SIGNAL_THRESHOLD } = {}) {
scripts/lib/policy-feed-reliability.js:7:function toNonNegativeInt(value, fallback = 0) {
scripts/lib/policy-feed-reliability.js:86:function dedupeAlerts(alerts) {
scripts/report-mcp-adoption.js:12:function positiveInteger(value, fallback) {
scripts/report-mcp-adoption.js:17:async function main() {
scripts/report-mcp-adoption.js:5:function argValue(name, fallback = "") {
scripts/request-query-regression.test.js:39:function assertNoCompatibilityQueryReads(directory) {
scripts/review-policy-event.js:12:function fail(message) {
scripts/review-policy-event.js:17:async function main() {
scripts/review-policy-event.js:6:function argValue(name, fallback = "") {
scripts/rulebook-migration-dry-run.js:161:function validateMigrationManifestSchema(manifest) {
scripts/rulebook-migration-dry-run.js:171:function usage() {
scripts/rulebook-migration-dry-run.js:187:function takeValue(args, index, flag) {
scripts/rulebook-migration-dry-run.js:195:function parseCandidateRulebook(value) {
scripts/rulebook-migration-dry-run.js:206:function parseCandidateAdapter(value) {
scripts/rulebook-migration-dry-run.js:221:function parseArgs(argv) {
scripts/rulebook-migration-dry-run.js:24:function isPlainObject(value) {
scripts/rulebook-migration-dry-run.js:275:function uniquePush(list, value) {
scripts/rulebook-migration-dry-run.js:279:function pathRelativeToRepo(path) {
scripts/rulebook-migration-dry-run.js:283:function validateMigrationManifest(manifest, manifestPath) {
scripts/rulebook-migration-dry-run.js:28:function clone(value) {
scripts/rulebook-migration-dry-run.js:32:function canonicalJson(value) {
scripts/rulebook-migration-dry-run.js:406:function applyMigrationManifest(options) {
scripts/rulebook-migration-dry-run.js:41:function loadJson(path) {
scripts/rulebook-migration-dry-run.js:45:function resolveFromRepo(path) {
scripts/rulebook-migration-dry-run.js:473:async function evaluateReplayRequest(request, options) {
scripts/rulebook-migration-dry-run.js:49:function resolveLocalSchemaRef(rootSchema, ref) {
scripts/rulebook-migration-dry-run.js:543:function semanticOutput(result) {
scripts/rulebook-migration-dry-run.js:554:function actualHistoricalRecord(evaluation) {
scripts/rulebook-migration-dry-run.js:570:function expectedHistoricalRecord(record) {
scripts/rulebook-migration-dry-run.js:585:function valuesEqual(left, right) {
scripts/rulebook-migration-dry-run.js:589:function compareHistoricalRecord(expected, actual) {
scripts/rulebook-migration-dry-run.js:60:function valueType(value) {
scripts/rulebook-migration-dry-run.js:615:function fileNameFromFixtureRef(fixtureRef) {
scripts/rulebook-migration-dry-run.js:624:function classifyDrifts(results, manifest) {
scripts/rulebook-migration-dry-run.js:650:function migrationIsApproved(migration) {
scripts/rulebook-migration-dry-run.js:660:async function runDryRun(options) {
scripts/rulebook-migration-dry-run.js:68:function schemaTypeMatches(value, expectedType) {
scripts/rulebook-migration-dry-run.js:77:function validateJsonSchemaSubset(value, schema, rootSchema = schema, path = "migration") {
scripts/rulebook-migration-dry-run.js:790:function printText(report) {
scripts/rulebook-migration-dry-run.js:803:async function main() {
scripts/rulebook-runtime-production-smoke.js:124:function assertRuntimeBinding(payload, expectedMode, label) {
scripts/rulebook-runtime-production-smoke.js:134:function assertUnknownField(errors, expectedField, label) {
scripts/rulebook-runtime-production-smoke.js:142:function assertAdvisoryDecisionContract(payload, expectedMode, label) {
scripts/rulebook-runtime-production-smoke.js:151:async function assertKrafthausWorkflowReadinessBinding({ baseUrl, apiKey, timeoutMs, allowUnsigned }) {
scripts/rulebook-runtime-production-smoke.js:226:async function main() {
scripts/rulebook-runtime-production-smoke.js:22:function usage() {
scripts/rulebook-runtime-production-smoke.js:39:function parseArgs(argv) {
scripts/rulebook-runtime-production-smoke.js:68:function normalizeBaseUrl(value) {
scripts/rulebook-runtime-production-smoke.js:78:function loadFixture(fileName) {
scripts/rulebook-runtime-production-smoke.js:82:function loadRepoJson(...segments) {
scripts/rulebook-runtime-production-smoke.js:86:function expect(condition, message) {
scripts/rulebook-runtime-production-smoke.js:90:function sameJson(left, right) {
scripts/rulebook-runtime-production-smoke.js:94:async function requestJson({ baseUrl, path, method = "GET", body, apiKey, timeoutMs }) {
scripts/site-bridge-regression.js:13:function assert(condition, message) {
scripts/site-bridge-regression.js:17:function pass(message) {
scripts/site-bridge-regression.js:9:function read(relativePath) {
scripts/smoke-test.js:13:function createReq({
scripts/smoke-test.js:36:function createRes() {
scripts/smoke-test.js:50:function parseJson(label, body) {
scripts/smoke-test.js:58:async function runCase(label, handler, reqOptions, assertFn) {
scripts/smoke-test.js:67:function expect(condition, message) {
scripts/smoke-test.js:73:async function main() {
scripts/test-check-policies.js:1012:function testFallbackSignalTransitionActionableThreshold() {
scripts/test-check-policies.js:1035:function testNormalizeSourceUrlForComparisonCanonicalizesTrivialDifferences() {
scripts/test-check-policies.js:1041:function testEvaluateVendorSourceMigrationDetectsPrimaryUrlChanges() {
scripts/test-check-policies.js:1050:function testEvaluateVendorSourceMigrationSkipsStableOrMissingSources() {
scripts/test-check-policies.js:105:async function testMinIntervalSchedulerSerializesBrowserHookRequests() {
scripts/test-check-policies.js:1069:async function main() {
scripts/test-check-policies.js:138:async function testWorkPoolStartsNextItemWithoutWaitingForBatchPeers() {
scripts/test-check-policies.js:141:  const releaseFor = (item) => new Promise((resolve) => releases.set(item, resolve));
scripts/test-check-policies.js:161:async function testWorkPoolPreservesConcurrencyAndCooldown() {
scripts/test-check-policies.js:188:async function testWorkPoolStopsQueuedWorkAfterFailure() {
scripts/test-check-policies.js:204:async function testDirectFetchLaneOwnsAbortLifecycle() {
scripts/test-check-policies.js:209:async function testSuccessfulFetchCacheReusesSuccessfulReads() {
scripts/test-check-policies.js:212:  const load = async () => {
scripts/test-check-policies.js:232:async function testSuccessfulFetchCacheRetriesFailures() {
scripts/test-check-policies.js:251:async function testSuccessfulFetchCacheBypassReadsFreshWithoutReplacingCache() {
scripts/test-check-policies.js:287:async function testSuccessfulFetchCacheDefersRetentionUntilQualityPasses() {
scripts/test-check-policies.js:291:  const load = async () => {
scripts/test-check-policies.js:307:function testBlockedFetchReuseCacheRetainsOnlyExhaustedFailures() {
scripts/test-check-policies.js:325:function testPolicyFetchScheduleDefersKnownBlockedSources() {
scripts/test-check-policies.js:361:async function testPolicySetsReuseExhaustedBlockedFetchPlans() {
scripts/test-check-policies.js:389:    const buildPolicySet = (name) => {
scripts/test-check-policies.js:438:async function testPolicySetsShareSuccessfulRawSourceReads() {
scripts/test-check-policies.js:45:function writeJson(path, value) {
scripts/test-check-policies.js:467:    const buildPolicySet = (name) => {
scripts/test-check-policies.js:49:function readJson(path) {
scripts/test-check-policies.js:508:async function testPolicySetWritesMonitorArtifactTimestamps() {
scripts/test-check-policies.js:53:function testMonitorCheckDoesNotClaimHumanVerification() {
scripts/test-check-policies.js:546:function envInt(name, fallback) {
scripts/test-check-policies.js:552:function configuredCrossRunWindowSize() {
scripts/test-check-policies.js:556:function configuredDefaultWindowRequired() {
scripts/test-check-policies.js:561:function configuredHighSignalWindowRequired() {
scripts/test-check-policies.js:566:function configuredHighSignalMinPolicyHits() {
scripts/test-check-policies.js:570:function configuredHighSignalMinLines() {
scripts/test-check-policies.js:574:function testImmediateBlockOnCloudflareAnd403() {
scripts/test-check-policies.js:587:function testImmediateBlockAllowsZendesk404AsAuxiliary() {
scripts/test-check-policies.js:600:function testTransientFailureDoesNotImmediateBlock() {
scripts/test-check-policies.js:612:function testPlain403StillImmediateBlocks() {
scripts/test-check-policies.js:619:function testLegacyPendingModelDefaults() {
scripts/test-check-policies.js:628:function testCurrentPendingModelStaysActive() {
scripts/test-check-policies.js:638:function testZendeskApiTargetForArticle() {
scripts/test-check-policies.js:649:function testZendeskApiTargetForSection() {
scripts/test-check-policies.js:660:function testZendeskApiTargetRejectsUnsupportedPaths() {
scripts/test-check-policies.js:665:function testSemanticSignaturesStableForEmptyTokens() {
scripts/test-check-policies.js:673:function testSemanticSignaturesStableForMatchingNonEmptyTokens() {
scripts/test-check-policies.js:681:function testSemanticSignaturesStableRejectsMixedOrDifferentTokens() {
scripts/test-check-policies.js:694:function testReturnSignalsIgnoreCancellationOnlyLanguage() {
scripts/test-check-policies.js:705:function testRefundWindowsRequireDirectPolicyLanguage() {
scripts/test-check-policies.js:71:function testDistinctTier1FailuresCountVendorsOnceAcrossPolicies() {
scripts/test-check-policies.js:737:function testRelativeMetadataStaysStableAcrossDailyRuns() {
scripts/test-check-policies.js:759:function testTrialWindowsRequireDirectPolicyLanguage() {
scripts/test-check-policies.js:771:function testDailyAlertsPreserveReviewEvidence() {
scripts/test-check-policies.js:801:function testStrictDailyFeedRequiresReviewedChangeEvidence() {
scripts/test-check-policies.js:830:function testBuildChangeKeyPrefersSemanticSignature() {
scripts/test-check-policies.js:835:function testBuildChangeKeyFallsBackToHash() {
scripts/test-check-policies.js:840:function testBuildChangeKeyHandlesMissingValues() {
scripts/test-check-policies.js:845:function testHighSignalWindowCandidateDetection() {
scripts/test-check-policies.js:866:function testAdaptiveWindowRequiredForCandidate() {
scripts/test-check-policies.js:86:function testBrowserHookFailuresExposeSanitizedProviderReasons() {
scripts/test-check-policies.js:889:function testEvaluateSignalWindowSupportsRequiredOverride() {
scripts/test-check-policies.js:900:function testCountSignalWindowChangeFlips() {
scripts/test-check-policies.js:913:function testVolatileFlipThresholdOverrides() {
scripts/test-check-policies.js:926:function testSourceVolatilityTierResolution() {
scripts/test-check-policies.js:946:function testVolatileFlipThresholdIncludesFlakyTierDelta() {
scripts/test-check-policies.js:964:function testFallbackSignalTransitionRequiresStrongSignatures() {
scripts/test-check-policies.js:993:function testFallbackSignalTransitionStableSignatureResetsConsecutiveRuns() {
scripts/test-decision-contract.js:1032:async function testDecideRulebookRejectsExecutableOperator() {
scripts/test-decision-contract.js:1070:async function testDecideRulebookRejectsExecutablePayloadFields() {
scripts/test-decision-contract.js:108:function sha256(value) {
scripts/test-decision-contract.js:1104:async function testDecideRulebookRejectsUnsupportedBindingMode() {
scripts/test-decision-contract.js:112:function verifySignature({ publicKeyPem, bundleHash, signature }) {
scripts/test-decision-contract.js:1136:async function testDecideRulebookRejectsBindingModeShapeConflict() {
scripts/test-decision-contract.js:1177:async function testDecideRulebookRejectsCallerSuppliedDecisionMaterial() {
scripts/test-decision-contract.js:121:function assertRulebookAttestation(payload, label) {
scripts/test-decision-contract.js:1247:async function testDecideRulebookRejectsCallerSuppliedDecisionMaterialInInputs() {
scripts/test-decision-contract.js:1308:function testRulebookCoreRejectsUnsupportedBindingMode() {
scripts/test-decision-contract.js:1330:async function testDecideTrustedAdapterFixture() {
scripts/test-decision-contract.js:1423:async function testDecideDecisionMemoReadinessAdapterFixture() {
scripts/test-decision-contract.js:1571:async function testDecideKrafthausWorkflowReadinessAdapterFixture() {
scripts/test-decision-contract.js:1725:function testTrustedAdapterVersionLocks() {
scripts/test-decision-contract.js:1778:function testTrustedAdapterCapabilityAudit() {
scripts/test-decision-contract.js:1779:  const denied = auditTrustedAdapterImplementation(function forbiddenAdapter() {
scripts/test-decision-contract.js:1790:async function testTrustedAdapterCapabilityRuntimeEnforcement() {
scripts/test-decision-contract.js:1800:function testTrustedAdapterColdStartIsolation() {
scripts/test-decision-contract.js:1828:async function testDecideTrustedAdapterRejectsManifestDrift() {
scripts/test-decision-contract.js:1850:async function testDecideTrustedAdapterRejectsExecutablePayloadFields() {
scripts/test-decision-contract.js:1882:async function testDecideTrustedAdapterRejectsExecutableInputFields() {
scripts/test-decision-contract.js:1906:async function testRulebookV1PublicConformanceFixtures() {
scripts/test-decision-contract.js:201:function assertRuntimeBinding(payload, expectedMode, label) {
scripts/test-decision-contract.js:2140:async function testRulebookV1GoldenReplayCorpus() {
scripts/test-decision-contract.js:217:function assertAdvisoryDecisionContract(payload, expectedMode, label) {
scripts/test-decision-contract.js:227:function generateSigningEnv(keyId = "contract-test-rulebook-key") {
scripts/test-decision-contract.js:2320:async function testKrafthausWorkflowBindingExample() {
scripts/test-decision-contract.js:236:function runTrustedAdapterCapabilityRuntimeProbe() {
scripts/test-decision-contract.js:244:      const probe = (name, operation) => {
scripts/test-decision-contract.js:2455:function testRulebookMigrationDryRunCli() {
scripts/test-decision-contract.js:2665:function testRulebookRuntimeArchitectureDoc() {
scripts/test-decision-contract.js:279:async function testDecideSingleFixture() {
scripts/test-decision-contract.js:2996:async function testDecideGeminiDisabledByDefault() {
scripts/test-decision-contract.js:3028:async function testDecideGeminiDisabledPreservesDeterministicGuards() {
scripts/test-decision-contract.js:3105:async function testDecideGeminiDisabledRuntimeLineage() {
scripts/test-decision-contract.js:3119:  const request = (prompt, ip) => ({
scripts/test-decision-contract.js:3154:async function testDecideGeminiPaidMissingKeyFailsClosed() {
scripts/test-decision-contract.js:3189:async function testDecideGeminiBudgetMissingFailsClosed() {
scripts/test-decision-contract.js:3239:async function testDecideGeminiBudgetCapFailsClosed() {
scripts/test-decision-contract.js:323:async function testDecideMultiAdvisoryContract() {
scripts/test-decision-contract.js:3296:async function testDecideGeminiPaidSingleAttempt() {
scripts/test-decision-contract.js:3407:async function testDecideGeminiEmptyTextSingleAttempt() {
scripts/test-decision-contract.js:3448:async function testDecideGeminiIncompleteFinishReasonFailsClosed() {
scripts/test-decision-contract.js:3491:async function testDecideGeminiDeadline() {
scripts/test-decision-contract.js:3551:async function testDecideGeminiPromptLimit() {
scripts/test-decision-contract.js:3598:async function testPolicyV1Fixture() {
scripts/test-decision-contract.js:3630:async function testPolicyDecisionRecordMaterialFixture() {
scripts/test-decision-contract.js:3668:async function testRefundPolicyRulebookOutcomes() {
scripts/test-decision-contract.js:3736:async function testRefundPolicyRulebookBindsEvidenceIdentity() {
scripts/test-decision-contract.js:3737:  const evaluate = async (vendor) =>
scripts/test-decision-contract.js:3761:async function testRefundPolicyRulebookSignsAttestation() {
scripts/test-decision-contract.js:3807:async function testRefundPolicyRulebookRequiresSignedAttestation() {
scripts/test-decision-contract.js:3841:async function testTrialPolicyRulebookFixture() {
scripts/test-decision-contract.js:3886:async function testTrialPolicyRulebookOutcomes() {
scripts/test-decision-contract.js:3956:async function testTrialPolicyRulebookBindsEvidenceIdentity() {
scripts/test-decision-contract.js:3957:  const evaluate = async (vendor) =>
scripts/test-decision-contract.js:395:async function testDecideApiKeyFixture() {
scripts/test-decision-contract.js:3990:async function testTrialPolicyRulebookSignsAttestation() {
scripts/test-decision-contract.js:4038:async function testTrialPolicyRulebookRequiresSignedAttestation() {
scripts/test-decision-contract.js:4074:async function testCancelPolicyRulebookFixture() {
scripts/test-decision-contract.js:4111:async function testCancelPolicyRulebookOutcomes() {
scripts/test-decision-contract.js:4173:async function testCancelPolicyRulebookBindsEvidenceIdentity() {
scripts/test-decision-contract.js:4174:  const evaluate = async (vendor) =>
scripts/test-decision-contract.js:4199:async function testCancelPolicyRulebookSignsAttestation() {
scripts/test-decision-contract.js:41:function createBudgetedGeminiFetch(providerFetch) {
scripts/test-decision-contract.js:4239:async function testCancelPolicyRulebookRequiresSignedAttestation() {
scripts/test-decision-contract.js:4267:async function testReturnPolicyRulebookFixture() {
scripts/test-decision-contract.js:4310:async function testReturnPolicyRulebookOutcomes() {
scripts/test-decision-contract.js:4398:async function testReturnPolicyRulebookBindsEvidenceIdentity() {
scripts/test-decision-contract.js:4399:  const evaluate = async (vendor) =>
scripts/test-decision-contract.js:4424:async function testReturnPolicyRulebookSignsAttestation() {
scripts/test-decision-contract.js:443:async function testDecideProductionRequiresTrustedEdge() {
scripts/test-decision-contract.js:4470:async function testReturnPolicyRulebookRequiresSignedAttestation() {
scripts/test-decision-contract.js:4504:async function testWorkflowFixture() {
scripts/test-decision-contract.js:4558:async function testUcpVendorEnumConsistency() {
scripts/test-decision-contract.js:4579:function testRulebookRuntimeManifest() {
scripts/test-decision-contract.js:4827:function testMcpPublisherSupplyChain() {
scripts/test-decision-contract.js:4870:async function main() {
scripts/test-decision-contract.js:494:async function testDecideRuntimeFixture() {
scripts/test-decision-contract.js:62:function loadFixture(fileName) {
scripts/test-decision-contract.js:66:function loadJsonFromRepo(...segments) {
scripts/test-decision-contract.js:684:async function testDecideRulebookFixture() {
scripts/test-decision-contract.js:70:function loadPublicRulebookConformanceFixture(fileName) {
scripts/test-decision-contract.js:74:function loadPublicRulebookGoldenReplayFixture(fileName) {
scripts/test-decision-contract.js:761:async function testDecideRulebookEnforcesPublishedSchema() {
scripts/test-decision-contract.js:78:function assertIsoTimestamp(value, label) {
scripts/test-decision-contract.js:797:async function testDecideRulebookMissingInput() {
scripts/test-decision-contract.js:831:async function testDecideRulebookAttestationSigning() {
scripts/test-decision-contract.js:83:function assertLineage(payload, label) {
scripts/test-decision-contract.js:890:async function testDecideRulebookRequiresSignedAttestation() {
scripts/test-decision-contract.js:91:function assertUnknownField(errors, expectedField, label) {
scripts/test-decision-contract.js:933:async function testRulebookAttestationPublishesKeyHistory() {
scripts/test-decision-contract.js:988:async function testRulebookAttestationRejectsInvalidKeyHistory() {
scripts/test-decision-contract.js:99:function canonicalJson(value) {
scripts/test-helpers/http-harness.js:1:export function createReq({
scripts/test-helpers/http-harness.js:24:export function createRes() {
scripts/test-helpers/http-harness.js:38:export async function invokeJson(handler, reqOptions = {}) {
scripts/test-mcp-adoption-api.js:7:function createResponse() {
scripts/test-mcp-distribution.js:15:function tool(name, complete = true) {
scripts/test-mcp-distribution.js:25:function baseInput() {
scripts/test-mcp-distribution.js:40:function testTreatsMissingRegistryListingAsActionNotOutage() {
scripts/test-mcp-distribution.js:48:function testTreatsMissingCanonicalToolAsOutage() {
scripts/test-mcp-distribution.js:56:function testDetectsStaleLiveMetadataWithoutBreakingRuntimeHealth() {
scripts/test-mcp-distribution.js:65:function testSeparatesRegistryOutageFromMissingListing() {
scripts/test-mcp-distribution.js:73:function testDistributionInventoryMatchesManifest() {
scripts/test-mcp-marketplace-packages.js:15:function readJson(relativePath) {
scripts/test-mcp-marketplace-packages.js:19:function assertToolAnnotations(tools) {
scripts/test-mcp-telemetry.js:120:async function testSkipsSupabaseWhenDisabled() {
scripts/test-mcp-telemetry.js:133:async function testPersistsCompletedEvaluationBeforeEndingResponse() {
scripts/test-mcp-telemetry.js:38:function testOmitsCallerIdentityWithoutSalt() {
scripts/test-mcp-telemetry.js:43:function testPrefersDeclaredMcpClientName() {
scripts/test-mcp-telemetry.js:59:function testClassifiesOnlyAuthenticatedInternalProbes() {
scripts/test-mcp-telemetry.js:81:async function testPersistsMinimalTelemetryToSupabase() {
scripts/test-mcp-telemetry.js:9:function testBuildsPrivacyMinimalStableCallerTelemetry() {
scripts/test-policy-alerts-api.js:10:function createResponseRecorder() {
scripts/test-policy-alerts-api.js:111:function testBackfillsMissingPolicyEventDetails() {
scripts/test-policy-alerts-api.js:154:function createSupabaseFetchFixture({ dailyRows = [], policyEvents = [] } = {}) {
scripts/test-policy-alerts-api.js:155:  return async function fetchFixture(rawUrl) {
scripts/test-policy-alerts-api.js:173:async function testSupabaseFeedGatesChangeClaimsOnReview() {
scripts/test-policy-alerts-api.js:294:async function main() {
scripts/test-policy-alerts-api.js:31:async function invoke(query = {}, method = "GET") {
scripts/test-policy-alerts-api.js:45:function assertCommonPayload(result, expectedState, expectedLimit, expectedIncludeZero = true) {
scripts/test-policy-alerts-api.js:58:function assertNoLegacySourceObject(result) {
scripts/test-policy-alerts-api.js:63:function assertAlertShapeIfPresent(result) {
scripts/test-policy-alerts-api.js:86:function testAppliesRecordedPolicyEventReviews() {
scripts/test-policy-coverage-scorecard.js:115:function testCandidateMetadataAndProductionIdsAreValidated() {
scripts/test-policy-coverage-scorecard.js:12:function buildFixture() {
scripts/test-policy-coverage-scorecard.js:97:function testScorecardSeparatesTrackedFromAdmittedCoverage() {
scripts/test-policy-evidence-snapshot.js:33:const fetchImpl = async (url, init) => {
scripts/test-policy-feed.js:13:function loadFixture(fileName) {
scripts/test-policy-feed.js:17:function runFixture(fileName) {
scripts/test-policy-feed.js:36:function testIdempotentDuplicateSuppression() {
scripts/test-policy-feed.js:58:function main() {
scripts/test-policy-fetch-hook.js:21:function createHeaders(contentType = "application/json") {
scripts/test-policy-fetch-hook.js:29:async function callHook() {
scripts/test-policy-fetch-hook.js:7:function createResponse() {
scripts/test-policy-freshness.js:10:function testMarksExpiredHumanVerificationStale() {
scripts/test-policy-freshness.js:26:function testReportSeparatesMonitoringFromRulebookPromotion() {
scripts/test-policy-funnel.js:114:function buildsConservativeAggregateReport() {
scripts/test-policy-funnel.js:152:async function trackRoutePersistsBeforeResponding() {
scripts/test-policy-funnel.js:15:function createResponse() {
scripts/test-policy-funnel.js:29:function buildsMinimalAllowlistedEvent() {
scripts/test-policy-funnel.js:61:async function persistsOnlyMinimalFields() {
scripts/test-policy-mcp.js:108:async function testCallsCancellationTool() {
scripts/test-policy-mcp.js:131:async function testRoutesAmbiguousCancellationContextToReview() {
scripts/test-policy-mcp.js:178:async function testRoutesVariableTrialOfferToReview() {
scripts/test-policy-mcp.js:21:async function testListsAllPolicyNotaryTools() {
scripts/test-policy-mcp.js:227:async function testRoutesDynamicTrialsToReview() {
scripts/test-policy-mcp.js:272:async function testRoutesConditionalRefundToReview() {
scripts/test-policy-mcp.js:324:async function testKeepsApprovalBasedRefundsInManualReview() {
scripts/test-policy-mcp.js:368:async function testPublicPolicyRoutesFailClosed() {
scripts/test-policy-mcp.js:393:function testPolicyAutomationModesAreExplicit() {
scripts/test-policy-mcp.js:452:function testPolicySourceHashTracksReviewedPolicyNotMonitorTime() {
scripts/test-policy-mcp.js:45:async function testSupportsLifecyclePingAndProtocolNegotiation() {
scripts/test-policy-mcp.js:474:async function testRoutesConditionalReturnToReview() {
scripts/test-policy-mcp.js:526:async function testCallsEveryPolicyTool() {
scripts/test-policy-mcp.js:594:async function testLabelsSourceAndRuleFreshnessPrecisely() {
scripts/test-policy-mcp.js:620:async function testRejectsArgumentsOutsidePublishedSchema() {
scripts/test-policy-mcp.js:647:async function testRejectsUnexpectedBrowserOrigin() {
scripts/test-policy-mcp.js:667:async function testAcceptsInitializedNotificationWithoutResponseBody() {
scripts/test-policy-mcp.js:682:async function testRejectsGetWhenSseIsNotImplemented() {
scripts/test-policy-mcp.js:695:async function testRejectsNonJsonRpcTwoRequests() {
scripts/test-policy-mcp.js:712:async function testRejectsUnsupportedProtocolVersionHeader() {
scripts/test-policy-mcp.js:731:function readJson(relativePath) {
scripts/test-policy-mcp.js:735:function testPublishesCanonicalDiscoveryMetadata() {
scripts/test-policy-mcp.js:789:async function testPublishesOnePolicyMcpVersion() {
scripts/test-policy-mcp.js:819:async function testRoutesCanonicalPolicyHostname() {
scripts/test-policy-mcp.js:92:function testPublishesReadOnlyToolContracts() {
scripts/test-policy-review.js:22:function testRulebookUpdateRequiresVersion() {
scripts/test-policy-review.js:7:function testBuildsAuditableNoRuleChangeReview() {
scripts/test-policy-vendor-candidates.js:137:async function testChallengeDocumentCannotCountAsEvidence() {
scripts/test-policy-vendor-candidates.js:32:function successfulFetch() {
scripts/test-policy-vendor-candidates.js:46:async function testObservationSlotsCannotBeInflatedByReruns() {
scripts/test-policy-vendor-candidates.js:73:async function testFailedFetchIsRecordedWithoutThrowing() {
scripts/test-policy-vendor-candidates.js:95:async function testOfficialDocumentSourcesAreValidatedAndFetchedOnce() {
scripts/test-policy-vendor-lifecycle.js:106:function testUnstableCandidateEvidenceCannotGraduate() {
scripts/test-policy-vendor-lifecycle.js:11:function testCurrentDegradedAndExpiredPoliciesStayDistinct() {
scripts/test-policy-vendor-lifecycle.js:38:function successObservation(slot) {
scripts/test-policy-vendor-lifecycle.js:42:function testCandidateNeedsBurnInAndHumanApplicabilityReview() {
scripts/test-release-gates.js:8:function read(path) {
scripts/verify-policy-alerts-bridge.js:121:async function fetchJson(url) {
scripts/verify-policy-alerts-bridge.js:141:async function main() {
scripts/verify-policy-alerts-bridge.js:16:function sleep(ms) {
scripts/verify-policy-alerts-bridge.js:20:function buildRequestUrl(baseUrl, state, limit) {
scripts/verify-policy-alerts-bridge.js:27:function isLegacyPayload(payload) {
scripts/verify-policy-alerts-bridge.js:32:function extractRunId(runUrl = "") {
scripts/verify-policy-alerts-bridge.js:37:function validatePayload(payload, options) {
scripts/verify-policy-alerts-bridge.js:3:function toInt(value, fallback) {
scripts/verify-policy-alerts-bridge.js:8:function toFlag(value, fallback = false) {
scripts/workflow-zendesk-refund-test.js:27:function createRes() {
scripts/workflow-zendesk-refund-test.js:41:function parseJson(label, body) {
scripts/workflow-zendesk-refund-test.js:49:function expect(condition, message) {
scripts/workflow-zendesk-refund-test.js:4:function createReq({
scripts/workflow-zendesk-refund-test.js:53:async function runCase(label, handler, reqOptions, assertFn) {
scripts/workflow-zendesk-refund-test.js:62:async function withEnvironment(overrides, work) {
scripts/workflow-zendesk-refund-test.js:79:async function main() {
```

### Import/require graph

```text
api/cancel-mcp.js:1:import { compute, getSupportedVendors } from "../lib/cancel-compute.js";
api/cancel-mcp.js:2:import { createMcpHandler } from "../lib/mcp-handler.js";
api/cancel-mcp.js:3:import { loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
api/cancel-mcp.js:4:import {
api/compliance-export.js:1:import { buildComplianceSnapshot, snapshotToCsv } from "../lib/compliance-export.js";
api/decide.js:12:import { buildRulebookAttestation } from "../lib/rulebook-attestation.js";
api/decide.js:13:import { isRulebookAttestationSignatureRequired } from "../lib/rulebook-attestation-signing.js";
api/decide.js:14:import { executeTrustedAdapter } from "../lib/trusted-adapters.js";
api/decide.js:15:import { resolveGeminiRuntimePolicy } from "../lib/gemini-model-routing.js";
api/decide.js:16:import { releaseGeminiUsage, reserveGeminiUsage } from "../lib/gemini-usage-budget.js";
api/decide.js:17:import { resolveGeminiRequestPolicy } from "../lib/gemini-request-policy.js";
api/decide.js:18:import { timingSafeEqual } from "node:crypto";
api/decide.js:1:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../lib/rate-limit.js";
api/decide.js:2:import { persistLog } from "../lib/log.js";
api/decide.js:3:import { buildSourceHash, withLineage } from "../lib/lineage.js";
api/decide.js:4:import { evaluateRulebookV1 } from "../lib/rulebook-v1.js";
api/decide.js:5:import {
api/mcp.js:1:import { compute, getSupportedVendors } from "../lib/refund-compute.js";
api/mcp.js:2:import { createMcpHandler } from "../lib/mcp-handler.js";
api/mcp.js:3:import { loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
api/mcp.js:4:import {
api/metrics.js:1:import { getMetricsSnapshot } from "../lib/metrics-store.js";
api/metrics.js:2:import { getAxiomMetricsSnapshot } from "../lib/metrics-axiom.js";
api/metrics.js:3:import { getClientIp } from "../lib/rate-limit.js";
api/metrics.js:4:import { getPolicyGrowthReports } from "../lib/policy-growth-store.js";
api/policy-alerts.js:1:import { readFileSync, existsSync } from "node:fs";
api/policy-alerts.js:2:import { dirname, join } from "node:path";
api/policy-alerts.js:3:import { fileURLToPath } from "node:url";
api/policy-alerts.js:4:import { getPolicySupabaseConfig, supabaseRestRequest } from "../lib/policy-supabase.js";
api/policy-fetch-hook.js:1:import { timingSafeEqual } from "node:crypto";
api/policy-mcp.js:1:import { MCP_TOOL_CONFIG as refundTool } from "./mcp.js";
api/policy-mcp.js:2:import { MCP_TOOL_CONFIG as cancelTool } from "./cancel-mcp.js";
api/policy-mcp.js:3:import { MCP_TOOL_CONFIG as returnTool } from "./return-mcp.js";
api/policy-mcp.js:4:import { MCP_TOOL_CONFIG as trialTool } from "./trial-mcp.js";
api/policy-mcp.js:5:import { createMcpHandler } from "../lib/mcp-handler.js";
api/policy-mcp.js:6:import { POLICY_MCP_SERVER_INFO } from "../lib/policy-mcp-metadata.js";
api/return-mcp.js:1:import { compute, getSupportedVendors } from "../lib/return-compute.js";
api/return-mcp.js:2:import { createMcpHandler } from "../lib/mcp-handler.js";
api/return-mcp.js:3:import { loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
api/return-mcp.js:4:import {
api/rulebook-attestation-keys.js:1:import {
api/track.js:1:import { createRateLimiter, getClientIp, addRateLimitHeaders } from "../lib/rate-limit.js";
api/track.js:2:import { persistLog } from "../lib/log.js";
api/track.js:3:import { recordClientEvent, recordVendorRequest } from "../lib/metrics-store.js";
api/track.js:4:import { buildPseudonymousCallerId } from "../lib/privacy-identifiers.js";
api/track.js:5:import {
api/trial-mcp.js:1:import { compute, getSupportedVendors } from "../lib/trial-compute.js";
api/trial-mcp.js:2:import { createMcpHandler } from "../lib/mcp-handler.js";
api/trial-mcp.js:3:import { loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
api/trial-mcp.js:4:import {
api/v1/[policy]/[action].js:1:import cancelPenaltyHandler from "../../../lib/routes/v1/policies/cancel-penalty.js";
api/v1/[policy]/[action].js:2:import refundEligibilityHandler from "../../../lib/routes/v1/policies/refund-eligibility.js";
api/v1/[policy]/[action].js:3:import returnEligibilityHandler from "../../../lib/routes/v1/policies/return-eligibility.js";
api/v1/[policy]/[action].js:4:import trialTermsHandler from "../../../lib/routes/v1/policies/trial-terms.js";
api/v1/[policy]/[action].js:5:import { parseRequestQuery } from "../../../lib/request-query.js";
api/v1/workflows/zendesk/[workflow].js:1:import zendeskCancelWorkflow from "../../../../lib/routes/v1/workflows/zendesk/cancel.js";
api/v1/workflows/zendesk/[workflow].js:2:import zendeskRefundWorkflow from "../../../../lib/routes/v1/workflows/zendesk/refund.js";
api/v1/workflows/zendesk/[workflow].js:3:import zendeskReturnWorkflow from "../../../../lib/routes/v1/workflows/zendesk/return.js";
api/v1/workflows/zendesk/[workflow].js:4:import zendeskTrialWorkflow from "../../../../lib/routes/v1/workflows/zendesk/trial.js";
api/v1/workflows/zendesk/[workflow].js:5:import { parseRequestQuery } from "../../../../lib/request-query.js";
client/EXAMPLES.md:66:import requests
client/refund-check.py:26:import sys
client/refund-check.py:27:import requests
lib/cancel-compute.js:1:import { readFileSync } from "node:fs";
lib/cancel-compute.js:2:import { fileURLToPath } from "node:url";
lib/cancel-compute.js:3:import { dirname, join } from "node:path";
lib/cancel-compute.js:4:import { buildPolicySourceHash, withLineage } from "./lineage.js";
lib/cancel-compute.js:5:import { evaluateCancelPolicyRulebook } from "./cancel-rulebook.js";
lib/cancel-compute.js:6:import { evaluatePolicyEvidence } from "./policy-runtime-evidence.js";
lib/cancel-compute.js:7:import { bindPolicyRequest } from "./policy-request-binding.cjs";
lib/cancel-rulebook.js:1:import { readFileSync } from "node:fs";
lib/cancel-rulebook.js:3:import { buildRulebookAttestation } from "./rulebook-attestation.js";
lib/cancel-rulebook.js:4:import { isRulebookAttestationSignatureRequired } from "./rulebook-attestation-signing.js";
lib/cancel-rulebook.js:5:import { evaluateRulebookV1 } from "./rulebook-v1.js";
lib/cancel-rulebook.js:6:import { attachPolicyDecisionMaterial } from "./policy-decision-material.js";
lib/compliance-export.js:1:import { existsSync, readFileSync } from "node:fs";
lib/compliance-export.js:2:import { dirname, join } from "node:path";
lib/compliance-export.js:3:import { fileURLToPath } from "node:url";
lib/gemini-usage-budget.js:1:import { randomUUID } from "node:crypto";
lib/lineage.js:1:import { createHash } from "node:crypto";
lib/mcp-adoption-store.js:1:import {
lib/mcp-adoption-store.js:7:import { getPolicySupabaseConfig, supabaseRestRequest } from "./policy-supabase.js";
lib/mcp-handler.js:1:import { createRateLimiter, getClientIp, addRateLimitHeaders } from "./rate-limit.js";
lib/mcp-handler.js:2:import { persistLog } from "./log.js";
lib/mcp-handler.js:3:import { validateJsonSchema } from "./json-schema-lite.js";
lib/mcp-handler.js:4:import { buildMcpTelemetryEvent, persistMcpTelemetryEvent } from "./mcp-telemetry.js";
lib/mcp-telemetry.js:1:import { timingSafeEqual } from "node:crypto";
lib/mcp-telemetry.js:3:import { buildPseudonymousCallerId } from "./privacy-identifiers.js";
lib/policy-evidence-snapshot.js:1:import { readFileSync } from "node:fs";
lib/policy-evidence-snapshot.js:2:import { createHash } from "node:crypto";
lib/policy-evidence-snapshot.js:3:import { buildPolicySourceHash } from "./lineage.js";
lib/policy-evidence-snapshot.js:4:import { getPolicySupabaseConfig } from "./policy-supabase.js";
lib/policy-funnel-report.js:1:import { classifyMcpAdoptionEvent } from "./mcp-adoption-report.js";
lib/policy-funnel-telemetry.js:1:import { buildPseudonymousCallerId } from "./privacy-identifiers.js";
lib/policy-growth-store.js:11:import { getPolicySupabaseConfig, supabaseRestRequest } from "./policy-supabase.js";
lib/policy-growth-store.js:1:import {
lib/policy-growth-store.js:6:import { fetchPolicyMcpEvents } from "./mcp-adoption-store.js";
lib/policy-growth-store.js:7:import {
lib/policy-state-integrity.js:1:import { createHash } from 'node:crypto';
lib/policy-vendor-candidate-monitor.js:1:import { createHash } from "node:crypto";
lib/privacy-identifiers.js:1:import { createHmac } from "node:crypto";
lib/refund-compute.js:1:import { readFileSync } from "node:fs";
lib/refund-compute.js:2:import { fileURLToPath } from "node:url";
lib/refund-compute.js:3:import { dirname, join } from "node:path";
lib/refund-compute.js:4:import { buildPolicySourceHash, withLineage } from "./lineage.js";
lib/refund-compute.js:5:import { evaluateRefundPolicyRulebook } from "./refund-rulebook.js";
lib/refund-compute.js:6:import { evaluatePolicyEvidence } from "./policy-runtime-evidence.js";
lib/refund-compute.js:7:import { bindPolicyRequest } from "./policy-request-binding.cjs";
lib/refund-compute.js:8:import { resolveQualifyingConditionContext } from "./policy-context.js";
lib/refund-rulebook.js:1:import { readFileSync } from "node:fs";
lib/refund-rulebook.js:3:import { buildRulebookAttestation } from "./rulebook-attestation.js";
lib/refund-rulebook.js:4:import { isRulebookAttestationSignatureRequired } from "./rulebook-attestation-signing.js";
lib/refund-rulebook.js:5:import { evaluateRulebookV1 } from "./rulebook-v1.js";
lib/refund-rulebook.js:6:import { attachPolicyDecisionMaterial } from "./policy-decision-material.js";
lib/return-compute.js:1:import { readFileSync } from "node:fs";
lib/return-compute.js:2:import { fileURLToPath } from "node:url";
lib/return-compute.js:3:import { dirname, join } from "node:path";
lib/return-compute.js:4:import { buildPolicySourceHash, withLineage } from "./lineage.js";
lib/return-compute.js:5:import { evaluateReturnPolicyRulebook } from "./return-rulebook.js";
lib/return-compute.js:6:import { evaluatePolicyEvidence } from "./policy-runtime-evidence.js";
lib/return-compute.js:7:import { bindPolicyRequest } from "./policy-request-binding.cjs";
lib/return-compute.js:8:import { resolveQualifyingConditionContext } from "./policy-context.js";
lib/return-rulebook.js:1:import { readFileSync } from "node:fs";
lib/return-rulebook.js:3:import { buildRulebookAttestation } from "./rulebook-attestation.js";
lib/return-rulebook.js:4:import { isRulebookAttestationSignatureRequired } from "./rulebook-attestation-signing.js";
lib/return-rulebook.js:5:import { evaluateRulebookV1 } from "./rulebook-v1.js";
lib/return-rulebook.js:6:import { attachPolicyDecisionMaterial } from "./policy-decision-material.js";
lib/routes/v1/policies/cancel-penalty.js:1:import { compute, getRulesVersion } from "../../../cancel-compute.js";
lib/routes/v1/policies/cancel-penalty.js:2:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../rate-limit.js";
lib/routes/v1/policies/cancel-penalty.js:3:import { persistLog } from "../../../log.js";
lib/routes/v1/policies/cancel-penalty.js:4:import { exposePolicyDecisionMaterial } from "../../../policy-decision-material.js";
lib/routes/v1/policies/cancel-penalty.js:5:import { loadPolicyEvidenceSnapshot } from "../../../policy-evidence-snapshot.js";
lib/routes/v1/policies/refund-eligibility.js:1:import { compute, getRulesVersion } from "../../../refund-compute.js";
lib/routes/v1/policies/refund-eligibility.js:2:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../rate-limit.js";
lib/routes/v1/policies/refund-eligibility.js:3:import { persistLog } from "../../../log.js";
lib/routes/v1/policies/refund-eligibility.js:4:import { exposePolicyDecisionMaterial } from "../../../policy-decision-material.js";
lib/routes/v1/policies/refund-eligibility.js:5:import { loadPolicyEvidenceSnapshot } from "../../../policy-evidence-snapshot.js";
lib/routes/v1/policies/return-eligibility.js:1:import { compute, getRulesVersion } from "../../../return-compute.js";
lib/routes/v1/policies/return-eligibility.js:2:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../rate-limit.js";
lib/routes/v1/policies/return-eligibility.js:3:import { persistLog } from "../../../log.js";
lib/routes/v1/policies/return-eligibility.js:4:import { exposePolicyDecisionMaterial } from "../../../policy-decision-material.js";
lib/routes/v1/policies/return-eligibility.js:5:import { loadPolicyEvidenceSnapshot } from "../../../policy-evidence-snapshot.js";
lib/routes/v1/policies/trial-terms.js:1:import { compute, getRulesVersion } from "../../../trial-compute.js";
lib/routes/v1/policies/trial-terms.js:2:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../rate-limit.js";
lib/routes/v1/policies/trial-terms.js:3:import { persistLog } from "../../../log.js";
lib/routes/v1/policies/trial-terms.js:4:import { exposePolicyDecisionMaterial } from "../../../policy-decision-material.js";
lib/routes/v1/policies/trial-terms.js:5:import { loadPolicyEvidenceSnapshot } from "../../../policy-evidence-snapshot.js";
lib/routes/v1/workflows/zendesk/cancel.js:1:import cancelPenaltyHandler from "../../policies/cancel-penalty.js";
lib/routes/v1/workflows/zendesk/cancel.js:2:import { createZendeskWorkflowHandler } from "./workflow-common.js";
lib/routes/v1/workflows/zendesk/refund.js:1:import refundEligibilityHandler from "../../policies/refund-eligibility.js";
lib/routes/v1/workflows/zendesk/refund.js:2:import { createZendeskWorkflowHandler } from "./workflow-common.js";
lib/routes/v1/workflows/zendesk/return.js:1:import returnEligibilityHandler from "../../policies/return-eligibility.js";
lib/routes/v1/workflows/zendesk/return.js:2:import { createZendeskWorkflowHandler } from "./workflow-common.js";
lib/routes/v1/workflows/zendesk/trial.js:1:import trialTermsHandler from "../../policies/trial-terms.js";
lib/routes/v1/workflows/zendesk/trial.js:2:import { createZendeskWorkflowHandler } from "./workflow-common.js";
lib/routes/v1/workflows/zendesk/workflow-common.js:1:import { timingSafeEqual } from "node:crypto";
lib/routes/v1/workflows/zendesk/workflow-common.js:3:import decideHandler from "../../../../../api/decide.js";
lib/routes/v1/workflows/zendesk/workflow-common.js:4:import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../../rate-limit.js";
lib/routes/v1/workflows/zendesk/workflow-common.js:5:import { persistLog } from "../../../../log.js";
lib/rulebook-attestation-signing.js:1:import {
lib/rulebook-attestation.js:1:import { createHash } from "node:crypto";
lib/rulebook-attestation.js:2:import { signRulebookAttestationBundleHash } from "./rulebook-attestation-signing.js";
lib/rulebook-runtime-contract.js:1:import { createHash } from "node:crypto";
lib/rulebook-runtime-contract.js:2:import { readFileSync } from "node:fs";
lib/rulebook-runtime-contract.js:3:import { dirname, join } from "node:path";
lib/rulebook-runtime-contract.js:4:import { fileURLToPath } from "node:url";
lib/rulebook-v1.js:1:import { createHash } from "node:crypto";
lib/rulebook-v1.js:3:import { validateJsonSchemaSubset } from "./json-schema-subset.js";
lib/rulebook-v1.js:4:import {
lib/trial-compute.js:1:import { readFileSync } from "node:fs";
lib/trial-compute.js:2:import { fileURLToPath } from "node:url";
lib/trial-compute.js:3:import { dirname, join } from "node:path";
lib/trial-compute.js:4:import { buildPolicySourceHash, withLineage } from "./lineage.js";
lib/trial-compute.js:5:import { evaluateTrialPolicyRulebook } from "./trial-rulebook.js";
lib/trial-compute.js:6:import { evaluatePolicyEvidence } from "./policy-runtime-evidence.js";
lib/trial-compute.js:7:import { bindPolicyRequest } from "./policy-request-binding.cjs";
lib/trial-rulebook.js:1:import { readFileSync } from "node:fs";
lib/trial-rulebook.js:3:import { buildRulebookAttestation } from "./rulebook-attestation.js";
lib/trial-rulebook.js:4:import { isRulebookAttestationSignatureRequired } from "./rulebook-attestation-signing.js";
lib/trial-rulebook.js:5:import { evaluateRulebookV1 } from "./rulebook-v1.js";
lib/trial-rulebook.js:6:import { attachPolicyDecisionMaterial } from "./policy-decision-material.js";
lib/trusted-adapter-definitions.js:1:import {
lib/trusted-adapter-isolation.js:1:import { Worker } from "node:worker_threads";
lib/trusted-adapter-isolation.js:3:import {
lib/trusted-adapter-worker.js:1:import { parentPort, workerData } from "node:worker_threads";
lib/trusted-adapter-worker.js:3:import { installDeniedAmbientCapabilities } from "./trusted-adapter-capabilities.js";
lib/trusted-adapter-worker.js:4:import { getRegisteredTrustedAdapter } from "./trusted-adapter-definitions.js";
lib/trusted-adapters.js:13:import { executeTrustedAdapterIsolated } from "./trusted-adapter-isolation.js";
lib/trusted-adapters.js:1:import { createHash } from "node:crypto";
lib/trusted-adapters.js:2:import {
lib/trusted-adapters.js:8:import {
scripts/audit-policy-freshness.js:3:import { readFileSync } from "node:fs";
scripts/audit-policy-freshness.js:4:import { dirname, join } from "node:path";
scripts/audit-policy-freshness.js:5:import { fileURLToPath } from "node:url";
scripts/audit-policy-freshness.js:7:import { buildPolicyFreshnessReport } from "../lib/policy-freshness.js";
scripts/check-mcp-distribution.js:3:import { readFileSync } from "node:fs";
scripts/check-mcp-distribution.js:4:import { dirname, join } from "node:path";
scripts/check-mcp-distribution.js:5:import { fileURLToPath } from "node:url";
scripts/check-mcp-distribution.js:7:import { buildMcpDistributionHealthReport } from "../lib/mcp-distribution-health.js";
scripts/check-policies.js:13:import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
scripts/check-policies.js:14:import { createHash } from "node:crypto";
scripts/check-policies.js:15:import { fileURLToPath, pathToFileURL } from "node:url";
scripts/check-policies.js:16:import { dirname, join } from "node:path";
scripts/check-policies.js:17:import { buildAlertSignature } from "./lib/policy-feed-reliability.js";
scripts/check-policies.js:18:import { getPolicySupabaseConfig, supabaseRestRequest, supabaseUpsertRows } from "../lib/policy-supabase.js";
scripts/check-policies.js:19:import { buildPolicyEvidenceSnapshot, POLICY_EVIDENCE_ARTIFACT_PATH } from "../lib/policy-evidence-snapshot.js";
scripts/check-policies.js:20:import { validatePolicyStateArtifacts } from "../lib/policy-state-integrity.js";
scripts/check-policies.js:21:import {
scripts/check-policies.js:25:import { mapWithConcurrency } from "../lib/async-work-pool.js";
scripts/check-policies.js:26:import { createBlockedFetchReuseCache } from "../lib/blocked-fetch-reuse-cache.js";
scripts/check-policies.js:27:import { monitorPolicyVendorCandidates } from "../lib/policy-vendor-candidate-monitor.js";
scripts/check-policies.js:28:import { createSuccessfulFetchCache } from "../lib/successful-fetch-cache.js";
scripts/check-policies.js:29:import {
scripts/generate-golden-replay-corpus.js:10:import {
scripts/generate-golden-replay-corpus.js:14:import { executeTrustedAdapter } from "../lib/trusted-adapters.js";
scripts/generate-golden-replay-corpus.js:3:import assert from "node:assert/strict";
scripts/generate-golden-replay-corpus.js:4:import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
scripts/generate-golden-replay-corpus.js:5:import { dirname, join } from "node:path";
scripts/generate-golden-replay-corpus.js:6:import { fileURLToPath } from "node:url";
scripts/generate-golden-replay-corpus.js:8:import { buildRulebookAttestation } from "../lib/rulebook-attestation.js";
scripts/generate-golden-replay-corpus.js:9:import { evaluateRulebookV1 } from "../lib/rulebook-v1.js";
scripts/generate-outbound-domain-inventory.mjs:3:import fs from 'node:fs';
scripts/generate-outbound-domain-inventory.mjs:4:import path from 'node:path';
scripts/generate-policy-mcp-metadata.js:10:import { MCP_TOOL_CONFIG as trialTool } from "../api/trial-mcp.js";
scripts/generate-policy-mcp-metadata.js:11:import {
scripts/generate-policy-mcp-metadata.js:3:import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
scripts/generate-policy-mcp-metadata.js:4:import { dirname, join } from "node:path";
scripts/generate-policy-mcp-metadata.js:5:import { fileURLToPath } from "node:url";
scripts/generate-policy-mcp-metadata.js:7:import { MCP_TOOL_CONFIG as refundTool } from "../api/mcp.js";
scripts/generate-policy-mcp-metadata.js:8:import { MCP_TOOL_CONFIG as cancelTool } from "../api/cancel-mcp.js";
scripts/generate-policy-mcp-metadata.js:9:import { MCP_TOOL_CONFIG as returnTool } from "../api/return-mcp.js";
scripts/generate-rulebook-runtime-manifest.js:3:import { mkdirSync, writeFileSync } from "node:fs";
scripts/generate-rulebook-runtime-manifest.js:4:import { dirname, join } from "node:path";
scripts/generate-rulebook-runtime-manifest.js:5:import { fileURLToPath } from "node:url";
scripts/generate-rulebook-runtime-manifest.js:7:import { buildRulebookRuntimeManifest } from "../lib/rulebook-runtime-contract.js";
scripts/lib/policy-feed-reliability.js:1:import { createHash } from "node:crypto";
scripts/mcp-check-local.sh:40:      const net = require("node:net");
scripts/report-mcp-adoption.js:3:import { getMcpAdoptionReport } from "../lib/mcp-adoption-store.js";
scripts/request-query-regression.test.js:1:import assert from "node:assert/strict";
scripts/request-query-regression.test.js:2:import fs from "node:fs";
scripts/request-query-regression.test.js:3:import path from "node:path";
scripts/request-query-regression.test.js:4:import { fileURLToPath } from "node:url";
scripts/request-query-regression.test.js:6:import v1PolicyDispatcher from "../api/v1/[policy]/[action].js";
scripts/request-query-regression.test.js:7:import zendeskWorkflowDispatcher from "../api/v1/workflows/zendesk/[workflow].js";
scripts/request-query-regression.test.js:8:import { parseRequestQuery } from "../lib/request-query.js";
scripts/review-policy-event.js:3:import { buildPolicyReviewUpdate, POLICY_REVIEW_STATUSES } from "../lib/policy-review.js";
scripts/review-policy-event.js:4:import { getPolicySupabaseConfig, supabaseRestRequest } from "../lib/policy-supabase.js";
scripts/rulebook-migration-dry-run.js:13:import { executeTrustedAdapter } from "../lib/trusted-adapters.js";
scripts/rulebook-migration-dry-run.js:3:import { readFileSync } from "node:fs";
scripts/rulebook-migration-dry-run.js:4:import { dirname, isAbsolute, join, resolve } from "node:path";
scripts/rulebook-migration-dry-run.js:5:import { fileURLToPath } from "node:url";
scripts/rulebook-migration-dry-run.js:7:import { buildRulebookAttestation } from "../lib/rulebook-attestation.js";
scripts/rulebook-migration-dry-run.js:8:import { evaluateRulebookV1 } from "../lib/rulebook-v1.js";
scripts/rulebook-migration-dry-run.js:9:import {
scripts/rulebook-runtime-production-smoke.js:3:import { readFileSync } from "node:fs";
scripts/rulebook-runtime-production-smoke.js:4:import { dirname, join } from "node:path";
scripts/rulebook-runtime-production-smoke.js:5:import { fileURLToPath } from "node:url";
scripts/rulebook-runtime-production-smoke.js:7:import { buildAdvisoryDecisionContract } from "../lib/rulebook-runtime-contract.js";
scripts/site-bridge-regression.js:3:import fs from "node:fs";
scripts/site-bridge-regression.js:4:import path from "node:path";
scripts/site-bridge-regression.js:5:import { fileURLToPath } from "node:url";
scripts/smoke-test.js:10:import complianceExport from "../api/compliance-export.js";
scripts/smoke-test.js:11:import zendeskWorkflowRoute from "../api/v1/workflows/zendesk/[workflow].js";
scripts/smoke-test.js:1:import health from "../api/health.js";
scripts/smoke-test.js:2:import "./test-helpers/install-policy-evidence-fixture.js";
scripts/smoke-test.js:3:import v1PolicyRoute from "../api/v1/[policy]/[action].js";
scripts/smoke-test.js:4:import refundMcp from "../api/mcp.js";
scripts/smoke-test.js:5:import cancelMcp from "../api/cancel-mcp.js";
scripts/smoke-test.js:6:import returnMcp from "../api/return-mcp.js";
scripts/smoke-test.js:7:import trialMcp from "../api/trial-mcp.js";
scripts/smoke-test.js:8:import track from "../api/track.js";
scripts/smoke-test.js:9:import metrics from "../api/metrics.js";
scripts/sync-public-policy-sources.js:3:import { copyFileSync } from "node:fs";
scripts/test-check-policies.js:10:import { createBlockedFetchReuseCache } from "../lib/blocked-fetch-reuse-cache.js";
scripts/test-check-policies.js:11:import { createSuccessfulFetchCache } from "../lib/successful-fetch-cache.js";
scripts/test-check-policies.js:13:import {
scripts/test-check-policies.js:3:import assert from "node:assert/strict";
scripts/test-check-policies.js:4:import { createServer } from "node:http";
scripts/test-check-policies.js:5:import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
scripts/test-check-policies.js:6:import { tmpdir } from "node:os";
scripts/test-check-policies.js:7:import { join } from "node:path";
scripts/test-check-policies.js:9:import { mapWithConcurrency } from "../lib/async-work-pool.js";
scripts/test-decision-contract.js:12:import { existsSync, readFileSync } from "node:fs";
scripts/test-decision-contract.js:13:import { dirname, join } from "node:path";
scripts/test-decision-contract.js:14:import { fileURLToPath } from "node:url";
scripts/test-decision-contract.js:15:import { Worker } from "node:worker_threads";
scripts/test-decision-contract.js:17:import decideHandler from "../api/decide.js";
scripts/test-decision-contract.js:18:import rulebookAttestationKeysHandler from "../api/rulebook-attestation-keys.js";
scripts/test-decision-contract.js:19:import v1PolicyDispatcher from "../api/v1/[policy]/[action].js";
scripts/test-decision-contract.js:20:import zendeskWorkflowDispatcher from "../api/v1/workflows/zendesk/[workflow].js";
scripts/test-decision-contract.js:21:import {
scripts/test-decision-contract.js:27:import { evaluateRulebookV1 } from "../lib/rulebook-v1.js";
scripts/test-decision-contract.js:28:import {
scripts/test-decision-contract.js:2:import "./test-helpers/install-policy-evidence-fixture.js";
scripts/test-decision-contract.js:33:import { invokeJson } from "./test-helpers/http-harness.js";
scripts/test-decision-contract.js:4:import assert from "node:assert/strict";
scripts/test-decision-contract.js:5:import { execFileSync } from "node:child_process";
scripts/test-decision-contract.js:6:import {
scripts/test-gemini-model-routing.js:3:import assert from "node:assert/strict";
scripts/test-gemini-model-routing.js:4:import {
scripts/test-gemini-usage-budget.js:10:import {
scripts/test-gemini-usage-budget.js:3:import assert from "node:assert/strict";
scripts/test-gemini-usage-budget.js:4:import {
scripts/test-helpers/install-policy-evidence-fixture.js:2:import { mock } from "node:test";
scripts/test-helpers/install-policy-evidence-fixture.js:3:import { createHash } from "node:crypto";
scripts/test-helpers/install-policy-evidence-fixture.js:4:import { buildPolicyEvidenceSnapshot, readPolicyEvidenceCatalog, POLICY_EVIDENCE_ARTIFACT_PATH } from "../../lib/policy-evidence-snapshot.js";
scripts/test-mcp-adoption-api.js:3:import assert from "node:assert/strict";
scripts/test-mcp-adoption-api.js:5:import handler, { resetMcpAdoptionCacheForTests } from "../api/metrics.js";
scripts/test-mcp-adoption-report.js:3:import assert from "node:assert/strict";
scripts/test-mcp-adoption-report.js:5:import {
scripts/test-mcp-distribution.js:3:import assert from "node:assert/strict";
scripts/test-mcp-distribution.js:4:import { readFileSync } from "node:fs";
scripts/test-mcp-distribution.js:6:import { buildMcpDistributionHealthReport } from "../lib/mcp-distribution-health.js";
scripts/test-mcp-marketplace-packages.js:1:import assert from "node:assert/strict";
scripts/test-mcp-marketplace-packages.js:2:import { existsSync, readFileSync } from "node:fs";
scripts/test-mcp-marketplace-packages.js:3:import { dirname, join } from "node:path";
scripts/test-mcp-marketplace-packages.js:4:import { fileURLToPath } from "node:url";
scripts/test-mcp-telemetry.js:3:import assert from "node:assert/strict";
scripts/test-mcp-telemetry.js:5:import { createMcpHandler } from "../lib/mcp-handler.js";
scripts/test-mcp-telemetry.js:6:import { buildMcpTelemetryEvent, persistMcpTelemetryEvent } from "../lib/mcp-telemetry.js";
scripts/test-mcp-telemetry.js:7:import { createReq, createRes } from "./test-helpers/http-harness.js";
scripts/test-policy-alerts-api.js:3:import assert from "node:assert/strict";
scripts/test-policy-alerts-api.js:5:import handler, {
scripts/test-policy-candidate-review-packet.js:1:import assert from 'node:assert/strict';
scripts/test-policy-candidate-review-packet.js:2:import { readFileSync } from 'node:fs';
scripts/test-policy-candidate-review-packet.js:3:import { buildPolicyVendorLifecycleReport } from '../lib/policy-vendor-lifecycle.js';
scripts/test-policy-coverage-scorecard.js:3:import assert from "node:assert/strict";
scripts/test-policy-coverage-scorecard.js:4:import { readFileSync } from "node:fs";
scripts/test-policy-coverage-scorecard.js:5:import { buildPolicyVendorLifecycleReport } from "../lib/policy-vendor-lifecycle.js";
scripts/test-policy-coverage-scorecard.js:7:import {
scripts/test-policy-evidence-postgres.js:1:import assert from 'node:assert/strict';
scripts/test-policy-evidence-postgres.js:2:import { execFileSync } from 'node:child_process';
scripts/test-policy-evidence-postgres.js:3:import { mkdtempSync, readFileSync } from 'node:fs';
scripts/test-policy-evidence-postgres.js:4:import { userInfo } from 'node:os';
scripts/test-policy-evidence-postgres.js:5:import { join } from 'node:path';
scripts/test-policy-evidence-snapshot.js:1:import assert from "node:assert/strict";
scripts/test-policy-evidence-snapshot.js:2:import { createHash } from "node:crypto";
scripts/test-policy-evidence-snapshot.js:3:import { buildPolicyEvidenceSnapshot, readPolicyEvidenceCatalog, loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
scripts/test-policy-evidence-transports.js:1:import "./test-helpers/install-policy-evidence-fixture.js";
scripts/test-policy-evidence-transports.js:2:import assert from "node:assert/strict";
scripts/test-policy-evidence-transports.js:3:import policyMcp from "../api/policy-mcp.js";
scripts/test-policy-evidence-transports.js:4:import cancel from "../lib/routes/v1/policies/cancel-penalty.js";
scripts/test-policy-evidence-transports.js:5:import { invokeJson } from "./test-helpers/http-harness.js";
scripts/test-policy-feed.js:3:import assert from "node:assert/strict";
scripts/test-policy-feed.js:4:import { readFileSync } from "node:fs";
scripts/test-policy-feed.js:5:import { dirname, join } from "node:path";
scripts/test-policy-feed.js:6:import { fileURLToPath } from "node:url";
scripts/test-policy-feed.js:8:import { mergePolicyAlertFeed } from "./lib/policy-feed-reliability.js";
scripts/test-policy-fetch-hook.js:3:import assert from "node:assert/strict";
scripts/test-policy-fetch-hook.js:5:import handler from "../api/policy-fetch-hook.js";
scripts/test-policy-freshness.js:3:import assert from "node:assert/strict";
scripts/test-policy-freshness.js:5:import {
scripts/test-policy-funnel.js:10:import {
scripts/test-policy-funnel.js:3:import assert from "node:assert/strict";
scripts/test-policy-funnel.js:5:import trackHandler from "../api/track.js";
scripts/test-policy-funnel.js:6:import {
scripts/test-policy-mcp-contracts.js:1:import { testPolicyEvidenceSnapshot as snapshot } from "./test-helpers/install-policy-evidence-fixture.js";
scripts/test-policy-mcp-contracts.js:2:import assert from "node:assert/strict";
scripts/test-policy-mcp-contracts.js:3:import Ajv2020 from "ajv/dist/2020.js";
scripts/test-policy-mcp-contracts.js:4:import { TOOL as refund } from "../api/mcp.js";
scripts/test-policy-mcp-contracts.js:5:import { TOOL as cancel } from "../api/cancel-mcp.js";
scripts/test-policy-mcp-contracts.js:6:import { TOOL as returns } from "../api/return-mcp.js";
scripts/test-policy-mcp-contracts.js:7:import { TOOL as trial } from "../api/trial-mcp.js";
scripts/test-policy-mcp-contracts.js:8:import { validateJsonSchema } from "../lib/json-schema-lite.js";
scripts/test-policy-mcp-http.js:1:import './test-helpers/install-policy-evidence-fixture.js';
scripts/test-policy-mcp-http.js:2:import { createServer } from 'node:http';
scripts/test-policy-mcp-http.js:3:import { execFile } from 'node:child_process';
scripts/test-policy-mcp-http.js:4:import { promisify } from 'node:util';
scripts/test-policy-mcp-http.js:5:import policy from '../api/policy-mcp.js';
scripts/test-policy-mcp-http.js:6:import refund from '../api/mcp.js';
scripts/test-policy-mcp-http.js:7:import cancel from '../api/cancel-mcp.js';
scripts/test-policy-mcp-http.js:8:import returns from '../api/return-mcp.js';
scripts/test-policy-mcp-http.js:9:import trial from '../api/trial-mcp.js';
scripts/test-policy-mcp.js:10:import refundEligibilityHandler from "../lib/routes/v1/policies/refund-eligibility.js";
scripts/test-policy-mcp.js:11:import trialTermsHandler from "../lib/routes/v1/policies/trial-terms.js";
scripts/test-policy-mcp.js:12:import {
scripts/test-policy-mcp.js:16:import { buildPolicySourceHash } from "../lib/lineage.js";
scripts/test-policy-mcp.js:17:import { validateJsonSchema } from "../lib/json-schema-lite.js";
scripts/test-policy-mcp.js:18:import middleware from "../middleware.js";
scripts/test-policy-mcp.js:19:import { invokeJson } from "./test-helpers/http-harness.js";
scripts/test-policy-mcp.js:1:import assert from "node:assert/strict";
scripts/test-policy-mcp.js:2:import "./test-helpers/install-policy-evidence-fixture.js";
scripts/test-policy-mcp.js:3:import { readFileSync } from "node:fs";
scripts/test-policy-mcp.js:5:import policyMcp from "../api/policy-mcp.js";
scripts/test-policy-mcp.js:6:import { MCP_TOOL_CONFIG as refundTool } from "../api/mcp.js";
scripts/test-policy-mcp.js:7:import { MCP_TOOL_CONFIG as cancelTool } from "../api/cancel-mcp.js";
scripts/test-policy-mcp.js:8:import { MCP_TOOL_CONFIG as returnTool } from "../api/return-mcp.js";
scripts/test-policy-mcp.js:9:import { MCP_TOOL_CONFIG as trialTool } from "../api/trial-mcp.js";
scripts/test-policy-review.js:3:import assert from "node:assert/strict";
scripts/test-policy-review.js:5:import { buildPolicyReviewUpdate } from "../lib/policy-review.js";
scripts/test-policy-runtime-evidence.js:1:import assert from "node:assert/strict";
scripts/test-policy-runtime-evidence.js:2:import { compute } from "../lib/cancel-compute.js";
scripts/test-policy-runtime-evidence.js:3:import { readFileSync } from "node:fs";
scripts/test-policy-state-integrity.js:1:import assert from 'node:assert/strict';
scripts/test-policy-state-integrity.js:2:import { createHash } from 'node:crypto';
scripts/test-policy-state-integrity.js:3:import { validatePolicyStateArtifacts } from '../lib/policy-state-integrity.js';
scripts/test-policy-vendor-candidates.js:3:import assert from "node:assert/strict";
scripts/test-policy-vendor-candidates.js:5:import {
scripts/test-policy-vendor-lifecycle.js:3:import assert from "node:assert/strict";
scripts/test-policy-vendor-lifecycle.js:5:import {
scripts/test-policy-workspace-integration.js:13:const { ensureDecisionContract } = require(resolve(siteRoot, 'lib/decision-contract.js'));
scripts/test-policy-workspace-integration.js:14:const { fetchPolicyNotaryEvidence } = require(resolve(appRoot, 'lib/policy-notary-evidence-client.js'));
scripts/test-policy-workspace-integration.js:2:import { testPolicyEvidenceSnapshot } from './test-helpers/install-policy-evidence-fixture.js';
scripts/test-policy-workspace-integration.js:3:import assert from 'node:assert/strict';
scripts/test-policy-workspace-integration.js:4:import { createRequire } from 'node:module';
scripts/test-policy-workspace-integration.js:5:import { resolve } from 'node:path';
scripts/test-policy-workspace-integration.js:6:import { readFileSync } from 'node:fs';
scripts/test-policy-workspace-integration.js:7:import decide from '../api/decide.js';
scripts/test-policy-workspace-integration.js:8:import { invokeJson } from './test-helpers/http-harness.js';
scripts/test-policy-workspace-integration.js:9:import { exposePolicyDecisionMaterial } from '../lib/policy-decision-material.js';
scripts/test-public-policy-sources.js:3:import assert from "node:assert/strict";
scripts/test-public-policy-sources.js:4:import { readFileSync } from "node:fs";
scripts/test-release-gates.js:3:import assert from "node:assert/strict";
scripts/test-release-gates.js:4:import { existsSync, readFileSync } from "node:fs";
scripts/test-sdk-package.js:3:import assert from 'node:assert/strict';
scripts/test-sdk-package.js:40:const sdk = require(path.join(sdkRoot, 'decide.js'));
scripts/test-sdk-package.js:4:import fs from 'node:fs';
scripts/test-sdk-package.js:5:import path from 'node:path';
scripts/test-sdk-package.js:6:import { execFileSync } from 'node:child_process';
scripts/test-sdk-package.js:7:import { createRequire } from 'node:module';
scripts/test-sdk-package.js:8:import { fileURLToPath } from 'node:url';
scripts/workflow-zendesk-refund-test.js:1:import "./test-helpers/install-policy-evidence-fixture.js";
scripts/workflow-zendesk-refund-test.js:2:import zendeskWorkflowRoute from "../api/v1/workflows/zendesk/[workflow].js";
```

### Frontend script load graph (`public/index.html`)

```text
```

## Regeneration Commands

```bash
./scripts/generate-project-inventory.sh
./scripts/check-project-inventory.sh
```
