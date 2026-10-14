/**
 * Chart-of-accounts and category -> account resolution, shared by the Xero
 * Settings API and every sync path.
 *
 * The Settings page and the code that posts bills used to disagree:
 *  - the page listed only Type === 'EXPENSE' accounts, hiding Direct Costs,
 *    Overhead and Depreciation (all on Xero's own Expenses tab) and the asset
 *    accounts expenses can be capitalised to;
 *  - posting silently fell back to codes seeded from Xero's Demo Company and a
 *    hardcoded table, then to '400', none of which the page showed;
 *  - nothing checked a code against the organisation's live chart.
 * Everything here is used by both sides, so what the page shows is exactly
 * what a sync posts, and a sync refuses to post to an account nobody chose.
 */
const db = require('../config/database');
const xeroService = require('./xeroService');

// Account types Xero lists on its Expenses tab. Class is checked first; this
// list covers accounts whose class is missing.
const EXPENSE_TYPES = new Set(['EXPENSE', 'DIRECTCOSTS', 'OVERHEADS', 'DEPRECIATN']);

// Asset accounts an expense can legitimately be coded to: capitalised
// equipment (FIXED/NONCURRENT) and prepaid subscriptions (PREPAYMENT/CURRENT).
// INVENTORY is excluded: Xero rejects direct coding to tracked inventory.
const ASSET_TYPES = new Set(['FIXED', 'NONCURRENT', 'PREPAYMENT', 'CURRENT']);

// Xero UI names for account types, for messages
const TYPE_LABELS = {
  BANK: 'Bank',
  CURRENT: 'Current Asset',
  CURRLIAB: 'Current Liability',
  DEPRECIATN: 'Depreciation',
  DIRECTCOSTS: 'Direct Costs',
  EQUITY: 'Equity',
  EXPENSE: 'Expense',
  FIXED: 'Fixed Asset',
  INVENTORY: 'Inventory',
  LIABILITY: 'Liability',
  NONCURRENT: 'Non-current Asset',
  OTHERINCOME: 'Other Income',
  OVERHEADS: 'Overhead',
  PREPAYMENT: 'Prepayment',
  REVENUE: 'Revenue',
  SALES: 'Sales',
  TERMLIAB: 'Non-current Liability',
  PAYG: 'PAYG Liability'
};

const typeLabel = (type) => TYPE_LABELS[type] || type || 'Unknown';

/** 'expense' | 'asset' | null - which picker group an account belongs to. */
function accountGroup(account) {
  if (!account) return null;
  if (account.class === 'EXPENSE' || EXPENSE_TYPES.has(account.type)) return 'expense';
  if (ASSET_TYPES.has(account.type)) return 'asset';
  return null;
}

/**
 * Why an account cannot be posted to, or null if it can.
 * 'archived' | 'no_code' | 'system_account' | 'not_postable_type'
 */
function accountProblem(account) {
  if (account.status !== 'ACTIVE') return 'archived';
  if (!account.code) return 'no_code';
  if (account.systemAccount) return 'system_account';
  if (!accountGroup(account)) return 'not_postable_type';
  return null;
}

function isSelectableAccount(account) {
  return Boolean(account) && accountProblem(account) === null;
}

/** Sentence fragment: "Account 404 (Bank Fees) <problemText>". */
function problemText(problem, account) {
  switch (problem) {
    case 'not_found': return 'no longer exists in Xero';
    case 'archived': return 'is archived in Xero';
    case 'no_code': return 'has no account code in Xero';
    case 'system_account': return 'is a Xero system account';
    case 'not_postable_type':
      return `is a ${typeLabel(account && account.type)} account, which expenses can't be posted to`;
    default: return null;
  }
}

/** Short label for the "full chart" view on the Settings page. */
function hiddenReason(account) {
  switch (accountProblem(account)) {
    case 'archived': return 'Archived';
    case 'no_code': return 'No account code';
    case 'system_account': return 'System account';
    case 'not_postable_type': return `${typeLabel(account.type)} account`;
    default: return null;
  }
}

/** Account annotated for the Settings page. */
function annotateAccount(account) {
  return {
    ...account,
    typeLabel: typeLabel(account.type),
    group: accountGroup(account),
    selectable: isSelectableAccount(account),
    hiddenReason: hiddenReason(account)
  };
}

// ---------------------------------------------------------------------------
// Chart cache. Callers must have set the connection's token on xeroService.
// ---------------------------------------------------------------------------
const CHART_TTL_MS = 5 * 60 * 1000;
const chartCache = new Map(); // tenantId -> { at, accounts }
const chartInFlight = new Map(); // tenantId -> Promise

/**
 * Live chart of accounts for a tenant: { success, accounts } or
 * { success: false, error, statusCode }. Concurrent callers share one request.
 */
function getChart(tenantId, { force = false } = {}) {
  const cached = chartCache.get(tenantId);
  if (!force && cached && Date.now() - cached.at < CHART_TTL_MS) {
    return Promise.resolve({ success: true, accounts: cached.accounts });
  }
  if (chartInFlight.has(tenantId)) {
    return chartInFlight.get(tenantId);
  }
  const request = xeroService.getChartOfAccounts(tenantId)
    .then((result) => {
      if (result.success) {
        chartCache.set(tenantId, { at: Date.now(), accounts: result.accounts });
      }
      return result;
    })
    .finally(() => chartInFlight.delete(tenantId));
  chartInFlight.set(tenantId, request);
  return request;
}

function clearChartCache() {
  chartCache.clear();
}

// ---------------------------------------------------------------------------
// Category keys
// ---------------------------------------------------------------------------
const DEFAULT_KEY = '__default__';

/**
 * Same normalisation the Settings page has always used for its category ids
 * ("Meals & Entertainment" -> "meals_entertainment"), so existing saved
 * mappings keep matching.
 */
function normalizeCategoryKey(value) {
  if (value === DEFAULT_KEY) return DEFAULT_KEY;
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[&\s]+/g, '_')
    .replace(/_+/g, '_');
}

// Receipt OCR stored snake-case ids ("fuel", "software") as the category, and
// an older Settings page saved mappings under them. Map them to the category
// they mean so those expenses use the mapping the admin sees.
const LEGACY_ALIASES = {
  meals: 'meals_entertainment',
  car_rental: 'travel',
  fuel: 'fuel_mileage',
  software: 'software_subscriptions',
  equipment: 'equipment_hardware',
  marketing: 'marketing_advertising',
  internet: 'utilities_telecom',
  utilities: 'utilities_telecom'
};

/**
 * Keys to try for a category.
 *
 * Aliases apply only to the exact lowercase ids the old OCR stored ('fuel',
 * 'equipment', ...), never to names people typed ('Equipment' on a project
 * budget line is its own category). When the alias target is an active
 * category, the legacy id resolves exactly as that category - the one the
 * Settings page shows it under - and nothing else.
 */
function candidateKeys(category, activeKeys) {
  const key = normalizeCategoryKey(category);
  const alias = String(category) === key ? LEGACY_ALIASES[key] : undefined;
  if (!alias) return [key];
  if (activeKeys && activeKeys.has(alias)) return [alias];
  return [key, alias];
}

// ---------------------------------------------------------------------------
// Mapping context and resolution
// ---------------------------------------------------------------------------

/**
 * Everything needed to resolve categories for one tenant.
 *  tenantMappings:  normalizedKey -> { storedKey, code, name, accountId }
 *                   (shared xero_account_mappings, chosen on the Settings page)
 *  profileMappings: profileId -> Map like tenantMappings, for mappings saved
 *                   for one account profile (e.g. one store)
 *  profileNames:    profileId -> name
 *  categoryCodes:   normalizedKey -> { code, name }
 *                   (expense_categories.xero_account_code, set on the Expense
 *                   Categories page; a fallback, shown on the Settings page)
 *  activeKeys:      keys of the active expense categories
 */
async function loadMappingContext(tenantId) {
  const [mappingRows, categoryRows, profileRows] = await Promise.all([
    db.query(
      `SELECT *
       FROM xero_account_mappings
       WHERE tenant_id = $1 AND (is_organization_wide = true OR user_id IS NULL)
       ORDER BY updated_at DESC NULLS LAST, id DESC`,
      [tenantId]
    ),
    db.query(
      `SELECT name, xero_account_code, xero_account_name, is_active
       FROM expense_categories`
    ).catch(() => ({ rows: [] })),
    db.query('SELECT id, name FROM xero_account_profiles').catch(() => ({ rows: [] }))
  ]);

  const tenantMappings = new Map();
  const profileMappings = new Map();
  for (const row of mappingRows.rows) {
    const key = normalizeCategoryKey(row.category);
    let scope = tenantMappings;
    if (row.account_profile_id) {
      if (!profileMappings.has(row.account_profile_id)) {
        profileMappings.set(row.account_profile_id, new Map());
      }
      scope = profileMappings.get(row.account_profile_id);
    }
    if (!scope.has(key)) { // newest row wins
      scope.set(key, {
        storedKey: row.category,
        code: row.xero_account_code,
        name: row.xero_account_name || null,
        accountId: row.xero_account_id || null
      });
    }
  }

  const profileNames = new Map(profileRows.rows.map((p) => [p.id, p.name]));

  const categoryCodes = new Map();
  const activeKeys = new Set();
  for (const row of categoryRows.rows) {
    const key = normalizeCategoryKey(row.name);
    if (row.is_active) activeKeys.add(key);
    if (row.is_active && row.xero_account_code && String(row.xero_account_code).trim() && !categoryCodes.has(key)) {
      categoryCodes.set(key, {
        code: String(row.xero_account_code).trim(),
        name: row.xero_account_name || null
      });
    }
  }

  return { tenantMappings, profileMappings, profileNames, categoryCodes, activeKeys };
}

/** The mappings saved for one profile (empty if none or no profile). */
function profileScope(ctx, profileId) {
  return (profileId && ctx.profileMappings && ctx.profileMappings.get(Number(profileId))) || null;
}

/**
 * Which account a category posts to, before checking the live chart.
 * Order, most specific first:
 *   the profile's mapping for the category -> the shared mapping for it ->
 *   the Expense Categories page code -> the profile's default account ->
 *   the shared default account.
 * Returns null when nothing is configured; there is deliberately no hardcoded
 * fallback.
 *
 * @param {number|null} profileId  the employee's account profile, if any
 */
function resolveCategoryAccount(category, ctx, profileId = null) {
  const keys = candidateKeys(category, ctx.activeKeys);
  const own = profileScope(ctx, profileId);

  // Every source for one key before moving to the next, so a category never
  // resolves through a different key than the row it is shown under
  for (const key of keys) {
    const p = own && own.get(key);
    if (p) return { ...p, source: 'profile_mapping', matchedKey: key };
    const m = ctx.tenantMappings.get(key);
    if (m) return { ...m, source: 'mapping', matchedKey: key };
    const c = ctx.categoryCodes.get(key);
    if (c) return { storedKey: null, code: c.code, name: c.name, accountId: null, source: 'expense_category', matchedKey: key };
  }
  const profileFallback = own && own.get(DEFAULT_KEY);
  if (profileFallback) return { ...profileFallback, source: 'profile_default', matchedKey: DEFAULT_KEY };
  const fallback = ctx.tenantMappings.get(DEFAULT_KEY);
  if (fallback) return { ...fallback, source: 'default', matchedKey: DEFAULT_KEY };
  return null;
}

/**
 * The mapping saved for exactly this key on the Settings page, or null: the
 * profile's own mapping when profileId is given, else the shared one.
 */
function directMapping(ctx, key, profileId = null) {
  if (profileId) {
    const own = profileScope(ctx, profileId);
    const p = own && own.get(key);
    return p ? { ...p, source: 'profile_mapping', matchedKey: key } : null;
  }
  const m = ctx.tenantMappings.get(key);
  return m ? { ...m, source: 'mapping', matchedKey: key } : null;
}

/**
 * Match a resolved mapping to the live chart. By AccountID when one was saved
 * (survives re-coding; a deleted account is not confused with a new one that
 * reuses the code), otherwise by code.
 */
function checkAgainstChart(resolved, chart) {
  const live = resolved.accountId
    ? chart.find((a) => a.accountId === resolved.accountId) || null
    : chart.find((a) => a.code === resolved.code) || null;
  return {
    live,
    problem: live ? accountProblem(live) : 'not_found',
    code: live && live.code ? live.code : resolved.code
  };
}

function sourceSuffix(source, profileName) {
  switch (source) {
    case 'profile_mapping': return ` (in the "${profileName}" account profile)`;
    case 'mapping': return profileName ? ' (the shared mapping for all profiles)' : '';
    case 'expense_category': return ' (set on the Expense Categories page)';
    case 'profile_default': return ` (the "${profileName}" profile's default account)`;
    case 'default': return ' (the shared default account)';
    default: return '';
  }
}

/**
 * The account an expense in `category` should post to, validated against the
 * live chart. { ok: true, code, accountName, source, profileName } or
 * { ok: false, error }.
 *
 * @param {number|null} profileId  the account profile of the employee who
 *   submitted the expense, if any
 */
function resolveExpenseAccount(category, ctx, chart, profileId = null) {
  const label = category || '(none)';
  const profileName = profileId ? (ctx.profileNames && ctx.profileNames.get(Number(profileId))) || null : null;
  const resolved = resolveCategoryAccount(category, ctx, profileName ? profileId : null);
  if (!resolved) {
    return {
      ok: false,
      error: profileName
        ? `No Xero account is mapped for the category "${label}" in the "${profileName}" account profile or the shared mappings. Map it, or set a default account, in Settings → Xero Integration, then sync again.`
        : `No Xero account is mapped for the category "${label}". Map it, or set a default account, in Settings → Xero Integration, then sync again.`
    };
  }

  const check = checkAgainstChart(resolved, chart);
  if (check.problem) {
    const name = (check.live && check.live.name) || resolved.name;
    return {
      ok: false,
      error: `The category "${label}" is mapped to Xero account ${check.code}${name ? ` (${name})` : ''}${sourceSuffix(resolved.source, profileName)}, which ${problemText(check.problem, check.live)}. Update the mapping in Settings → Xero Integration, then sync again.`
    };
  }

  return { ok: true, code: check.code, accountName: check.live.name, source: resolved.source, profileName };
}

/** A resolved mapping enriched with live-chart status for the Settings page. */
function describeMapping(resolved, chart) {
  if (!resolved) return null;
  const base = {
    source: resolved.source,
    matchedKey: resolved.matchedKey || null,
    storedKey: resolved.storedKey || null,
    code: resolved.code,
    name: resolved.name || null,
    accountId: resolved.accountId || null
  };
  if (!chart) {
    return { ...base, verified: false, problem: null, problemText: null };
  }
  const check = checkAgainstChart(resolved, chart);
  return {
    ...base,
    verified: true,
    code: check.code,
    name: check.live ? check.live.name : base.name,
    accountId: check.live ? check.live.accountId : base.accountId,
    problem: check.problem,
    problemText: check.problem ? problemText(check.problem, check.live) : null
  };
}

/**
 * Everything the Settings page needs to show, for each category, what it is
 * mapped to and where its expenses will actually post.
 *
 * @param {string} tenantId
 * @param {Array|null} chart  live accounts, or null if Xero could not be reached
 * @param {number|null} profileId  the account profile being edited; null for
 *   the shared mappings (used by every profile, and by employees without one)
 */
async function buildMappingOverview(tenantId, chart, profileId = null) {
  const ctx = await loadMappingContext(tenantId);
  const scope = profileId ? (profileScope(ctx, profileId) || new Map()) : ctx.tenantMappings;

  const [categoryResult, usedResult] = await Promise.all([
    db.query(
      `SELECT name FROM expense_categories
       WHERE is_active = true
       ORDER BY display_order, name`
    ).catch(() => ({ rows: [] })),
    // Categories that appear on approved expenses but match no active
    // category (project WBS categories, renamed categories, ...). Without a
    // row on the page they could never be mapped.
    db.query(
      `SELECT category, COUNT(*)::int AS expense_count
       FROM expenses
       WHERE status = 'approved' AND category IS NOT NULL AND category <> ''
       GROUP BY category
       ORDER BY COUNT(*) DESC
       LIMIT 200`
    )
  ]);

  const rows = [];
  const rowKeys = new Set();

  for (const { name } of categoryResult.rows) {
    const key = normalizeCategoryKey(name);
    if (rowKeys.has(key)) continue;
    rowKeys.add(key);
    rows.push({
      key,
      name,
      kind: 'category',
      mapping: describeMapping(directMapping(ctx, key, profileId), chart),
      effective: describeMapping(resolveCategoryAccount(name, ctx, profileId), chart)
    });
  }

  for (const { category, expense_count: expenseCount } of usedResult.rows) {
    // Same keys resolution uses, so a folded legacy id posts like its row
    if (candidateKeys(category, ctx.activeKeys).some((k) => rowKeys.has(k))) continue;
    const key = normalizeCategoryKey(category);
    rowKeys.add(key);
    rows.push({
      key,
      name: category,
      kind: 'expense_only',
      expenseCount,
      mapping: describeMapping(directMapping(ctx, key, profileId), chart),
      effective: describeMapping(resolveCategoryAccount(category, ctx, profileId), chart)
    });
  }

  // Saved mappings no row shows (old category ids, deleted categories). They
  // can still steer postings, so they are listed with a remove action.
  const orphans = [];
  for (const [key, mapping] of scope) {
    if (key === DEFAULT_KEY || rowKeys.has(key)) continue;
    orphans.push({
      key,
      ...describeMapping({ ...mapping, source: profileId ? 'profile_mapping' : 'mapping' }, chart),
      // A legacy id's mapping is only consulted if its category no longer exists
      usedByOlderExpenses: Boolean(LEGACY_ALIASES[key]) && !ctx.activeKeys.has(LEGACY_ALIASES[key])
    });
  }

  // Where unmapped categories go for this profile: its own default account,
  // else the shared one
  const ownDefault = directMapping(ctx, DEFAULT_KEY, profileId);
  const sharedDefault = profileId ? directMapping(ctx, DEFAULT_KEY) : null;

  return {
    tenantId,
    profileId: profileId || null,
    chartVerified: Boolean(chart),
    defaultMapping: describeMapping(ownDefault, chart),
    // Only for a profile without its own default: the shared one it falls back to
    inheritedDefault: !ownDefault && sharedDefault
      ? describeMapping({ ...sharedDefault, source: 'default' }, chart)
      : null,
    rows,
    orphans
  };
}

module.exports = {
  DEFAULT_KEY,
  LEGACY_ALIASES,
  accountGroup,
  accountProblem,
  isSelectableAccount,
  annotateAccount,
  problemText,
  typeLabel,
  getChart,
  clearChartCache,
  normalizeCategoryKey,
  candidateKeys,
  loadMappingContext,
  resolveCategoryAccount,
  checkAgainstChart,
  resolveExpenseAccount,
  describeMapping,
  buildMappingOverview
};
