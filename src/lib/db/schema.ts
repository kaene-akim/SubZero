import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const billingFrequencyEnum = pgEnum("billing_frequency", [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "active",
  "paused",
  "pending_cancellation",
  "cancelled",
  "expired",
  "payment_failed",
]);

export const subscriptionSourceEnum = pgEnum("subscription_source", [
  "manual",
  "gmail",
  "bank",
  "bundle",
  "demo",
]);

export const cancellationStatusEnum = pgEnum("cancellation_status", [
  "none",
  "requested",
  "pending",
  "confirmed",
  "disputed",
]);

export const offerTypeEnum = pgEnum("offer_type", [
  "free_trial",
  "introductory_price",
  "free_plan",
  "standard_plan",
  "discount",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "verified",
  "recently_checked",
  "unverified",
  "expired",
]);

export const bundleStatusEnum = pgEnum("bundle_status", [
  "draft",
  "scheduled",
  "activating",
  "completed",
  "partially_failed",
  "cancelled",
]);

export const activationStatusEnum = pgEnum("activation_status", [
  "awaiting_activation",
  "scheduled",
  "ready_for_checkout",
  "awaiting_user_action",
  "processing",
  "activated",
  "failed",
  "requires_attention",
  "cannot_synchronize",
  "cancelled",
]);

export const activationMethodEnum = pgEnum("activation_method", [
  "coordinated_checkout",
  "provider_api",
  "manual",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "refunded",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
  "cancelled",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "auto_confirmed",
  "confirmed",
  "rejected",
  "merged",
]);

export const matchingStatusEnum = pgEnum("matching_status", [
  "unmatched",
  "possible",
  "matched",
  "ignored",
]);

export const integrationConfigStatusEnum = pgEnum("integration_config_status", [
  "not_configured",
  "configured",
  "live",
  "unavailable",
]);

export const authTokenTypeEnum = pgEnum("auth_token_type", ["email_verify", "password_reset"]);

export const jobStatusEnum = pgEnum("job_status", ["running", "succeeded", "failed"]);

// ─── Users & auth ────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    image: text("image"),
    passwordHash: text("password_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    country: text("country").notNull().default("GB"),
    preferredCurrency: text("preferred_currency").notNull().default("GBP"),
    timezone: text("timezone").notNull().default("Europe/London"),
    monthlyBudget: numeric("monthly_budget", { precision: 14, scale: 2 }),
    preferredBillingDay: integer("preferred_billing_day").notNull().default(1),
    studentEligible: boolean("student_eligible").notNull().default(false),
    preferredBillingFrequency: billingFrequencyEnum("preferred_billing_frequency")
      .notNull()
      .default("monthly"),
    interestedCategories: text("interested_categories")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    onboardingStep: text("onboarding_step").notNull().default("welcome"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    notifyEmail: boolean("notify_email").notNull().default(true),
    notifyPush: boolean("notify_push").notNull().default(false),
    notifyInApp: boolean("notify_in_app").notNull().default(true),
    trialReminderDays: integer("trial_reminder_days")
      .array()
      .notNull()
      .default(sql`'{7,3,1}'::integer[]`),
    isDemo: boolean("is_demo").notNull().default(false),
    role: text("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("users_created_idx").on(t.createdAt)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: authTokenTypeEnum("type").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_type_idx").on(t.userId, t.type)],
);

export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  mode: text("mode").notNull(), // signin | link_gmail | link_bank
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  redirectTo: text("redirect_to"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // google | truelayer
    providerAccountId: text("provider_account_id"),
    accountLabel: text("account_label"),
    encryptedCredentials: jsonb("encrypted_credentials").notNull(),
    permissions: text("permissions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    connectionStatus: text("connection_status").notNull().default("connected"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    syncCursor: text("sync_cursor"),
    lastError: text("last_error"),
    consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("connected_accounts_user_provider_idx").on(t.userId, t.provider, t.providerAccountId),
    index("connected_accounts_user_idx").on(t.userId),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const providers = pgTable(
  "providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    serviceFamily: text("service_family"),
    description: text("description"),
    website: text("website").notNull(),
    logoUrl: text("logo_url"),
    brandColor: text("brand_color").notNull().default("#1F2937"),
    cancellationUrl: text("cancellation_url"),
    managementUrl: text("management_url"),
    integrationType: text("integration_type").notNull().default("coordinated_checkout"),
    availabilityStatus: text("availability_status").notNull().default("available"),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("providers_category_idx").on(t.category)],
);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    offerType: offerTypeEnum("offer_type").notNull(),
    trialDurationDays: integer("trial_duration_days"),
    initialPrice: numeric("initial_price", { precision: 14, scale: 2 }),
    initialCurrency: text("initial_currency").notNull().default("GBP"),
    renewalPrice: numeric("renewal_price", { precision: 14, scale: 2 }).notNull(),
    renewalCurrency: text("renewal_currency").notNull().default("GBP"),
    billingFrequency: billingFrequencyEnum("billing_frequency").notNull().default("monthly"),
    paymentMethodRequired: boolean("payment_method_required").notNull().default(true),
    cancellationRequirements: text("cancellation_requirements"),
    eligibility: text("eligibility"),
    countryAvailability: text("country_availability")
      .array()
      .notNull()
      .default(sql`'{GB}'::text[]`),
    registrationUrl: text("registration_url").notNull(),
    source: text("source").notNull(),
    sourceUrl: text("source_url").notNull(),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
    verificationNote: text("verification_note"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    expirationDate: date("expiration_date"),
    isStudent: boolean("is_student").notNull().default(false),
    isExclusive: boolean("is_exclusive").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("offers_provider_idx").on(t.providerId),
    index("offers_active_idx").on(t.isActive),
    uniqueIndex("offers_provider_title_idx").on(t.providerId, t.title),
  ],
);

export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    originalPrice: numeric("original_price", { precision: 14, scale: 2 }).notNull(),
    discountedPrice: numeric("discounted_price", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("GBP"),
    discountPercentage: numeric("discount_percentage", { precision: 5, scale: 2 }).notNull(),
    billingFrequency: billingFrequencyEnum("billing_frequency").notNull().default("monthly"),
    promotionalCode: text("promotional_code"),
    eligibility: text("eligibility"),
    durationMonths: integer("duration_months"),
    expirationDate: date("expiration_date"),
    redemptionUrl: text("redemption_url").notNull(),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
    verificationNote: text("verification_note"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    isStudent: boolean("is_student").notNull().default(false),
    newCustomersOnly: boolean("new_customers_only").notNull().default(false),
    existingCustomersOnly: boolean("existing_customers_only").notNull().default(false),
    source: text("source").notNull(),
    sourceUrl: text("source_url").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("discounts_provider_idx").on(t.providerId),
    uniqueIndex("discounts_provider_title_idx").on(t.providerId, t.title),
  ],
);

export const providerIntegrations = pgTable(
  "provider_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" })
      .unique(),
    integrationType: text("integration_type").notNull().default("coordinated_checkout"),
    capabilities: jsonb("capabilities")
      .notNull()
      .$type<{
        unifiedCheckout?: boolean;
        apiActivation?: boolean;
        cancellationApi?: boolean;
        delayedActivation?: boolean;
        billingDateChange?: boolean;
        immediateActivationRequired?: boolean;
        businessDaysOnly?: boolean;
        supportsTrials?: boolean;
      }>()
      .default({}),
    configurationStatus: integrationConfigStatusEnum("configuration_status")
      .notNull()
      .default("not_configured"),
    supportedOperations: text("supported_operations")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    docsUrl: text("docs_url"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    source: text("source").notNull(),
    asOf: date("as_of").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("exchange_rates_pair_date_idx").on(t.base, t.quote, t.asOf)],
);

// ─── Subscriptions ───────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
    serviceName: text("service_name").notNull(),
    category: text("category").notNull().default("Other Services"),
    price: numeric("price", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("GBP"),
    billingFrequency: billingFrequencyEnum("billing_frequency").notNull().default("monthly"),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    startDate: date("start_date"),
    nextBillingDate: date("next_billing_date"),
    trialStartDate: date("trial_start_date"),
    trialEndDate: date("trial_end_date"),
    renewalPrice: numeric("renewal_price", { precision: 14, scale: 2 }),
    renewalCurrency: text("renewal_currency").notNull().default("GBP"),
    autoRenew: boolean("auto_renew").notNull().default(true),
    managementUrl: text("management_url"),
    cancellationUrl: text("cancellation_url"),
    cancellationInstructions: text("cancellation_instructions"),
    cancellationStatus: cancellationStatusEnum("cancellation_status").notNull().default("none"),
    cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationConfirmedAt: timestamp("cancellation_confirmed_at", { withTimezone: true }),
    source: subscriptionSourceEnum("source").notNull().default("manual"),
    confidenceScore: numeric("confidence_score", { precision: 4, scale: 2 }),
    dedupeKey: text("dedupe_key"),
    notes: text("notes"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_user_status_idx").on(t.userId, t.status),
    index("subscriptions_next_billing_idx").on(t.nextBillingDate),
    uniqueIndex("subscriptions_user_dedupe_idx")
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    billingFrequency: billingFrequencyEnum("billing_frequency").notNull(),
    source: text("source").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_history_subscription_idx").on(t.subscriptionId, t.recordedAt)],
);

// ─── Bundles, activation & payments ─────────────────────────────────────────

export const bundles = pgTable(
  "bundles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: bundleStatusEnum("status").notNull().default("draft"),
    currency: text("currency").notNull().default("GBP"),
    timezone: text("timezone").notNull().default("Europe/London"),
    preferredActivationDate: date("preferred_activation_date"),
    targetBillingDate: date("target_billing_date"),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key").unique(),
    activationStartedAt: timestamp("activation_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bundles_user_idx").on(t.userId, t.status)],
);

export const bundleItems = pgTable(
  "bundle_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bundleId: uuid("bundle_id")
      .notNull()
      .references(() => bundles.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    activationStatus: activationStatusEnum("activation_status")
      .notNull()
      .default("awaiting_activation"),
    activationMethod: activationMethodEnum("activation_method")
      .notNull()
      .default("coordinated_checkout"),
    scheduledActivationDate: date("scheduled_activation_date"),
    expectedRenewalDate: date("expected_renewal_date"),
    actualRenewalDate: date("actual_renewal_date"),
    scheduling: jsonb("scheduling")
      .$type<{
        alignment: "exact" | "approximate" | "unsupported";
        trialDurationDays: number | null;
        explanation: string;
        warnings: string[];
        activationUrl?: string;
        requiresImmediateActivation?: boolean;
        businessDayAdjusted?: boolean;
      }>()
      .default({} as never),
    statusReason: text("status_reason"),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    idempotencyKey: text("idempotency_key").unique(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bundle_items_bundle_offer_idx").on(t.bundleId, t.offerId),
    index("bundle_items_bundle_idx").on(t.bundleId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    bundleId: uuid("bundle_id").references(() => bundles.id, { onDelete: "set null" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
    paymentProvider: text("payment_provider").notNull().default("none"),
    transactionReference: text("transaction_reference"),
    description: text("description"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_user_idx").on(t.userId, t.createdAt)],
);

// ─── Notifications ───────────────────────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "cascade",
    }),
    bundleId: uuid("bundle_id").references(() => bundles.id, { onDelete: "cascade" }),
    notificationType: text("notification_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    channels: text("channels")
      .array()
      .notNull()
      .default(sql`'{in_app}'::text[]`),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    status: notificationStatusEnum("status").notNull().default("pending"),
    dedupeKey: text("dedupe_key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_user_dedupe_idx").on(t.userId, t.dedupeKey),
    index("notifications_user_status_idx").on(t.userId, t.status, t.scheduledAt),
  ],
);

// ─── Discovery ───────────────────────────────────────────────────────────────

export const emailDetections = pgTable(
  "email_detections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectedAccountId: uuid("connected_account_id").references(() => connectedAccounts.id, {
      onDelete: "set null",
    }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    gmailMessageId: text("gmail_message_id").notNull(),
    threadId: text("thread_id"),
    subject: text("subject").notNull(),
    sender: text("sender").notNull(),
    snippet: text("snippet"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    classification: text("classification").notNull(),
    extractedData: jsonb("extracted_data").$type<Record<string, unknown>>().notNull().default({}),
    confidenceScore: numeric("confidence_score", { precision: 4, scale: 2 }).notNull(),
    confidenceReasons: text("confidence_reasons")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    classifierVersion: text("classifier_version").notNull().default("rules-v1"),
    reviewStatus: reviewStatusEnum("review_status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_detections_user_message_idx").on(t.userId, t.gmailMessageId),
    index("email_detections_user_review_idx").on(t.userId, t.reviewStatus),
  ],
);

export const transactionRecords = pgTable(
  "transaction_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
    matchedSubscriptionId: uuid("matched_subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id").notNull(),
    merchantName: text("merchant_name").notNull(),
    merchantReference: text("merchant_reference"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    transactionDate: date("transaction_date").notNull(),
    frequencyGuess: text("frequency_guess"),
    isRecurring: boolean("is_recurring").notNull().default(false),
    matchingStatus: matchingStatusEnum("matching_status").notNull().default("unmatched"),
    source: text("source").notNull().default("truelayer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transaction_records_external_idx").on(t.userId, t.source, t.externalId),
    index("transaction_records_user_idx").on(t.userId, t.transactionDate),
  ],
);

// ─── Monitoring & ops ───────────────────────────────────────────────────────

export const watchedDiscounts = pgTable(
  "watched_discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watched_discounts_user_provider_idx").on(t.userId, t.providerId)],
);

export const offerVerifications = pgTable(
  "offer_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "cascade" }),
    discountId: uuid("discount_id").references(() => discounts.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    httpStatus: integer("http_status"),
    status: verificationStatusEnum("status").notNull(),
    detail: text("detail"),
  },
  (t) => [index("offer_verifications_offer_idx").on(t.offerId, t.checkedAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_user_idx").on(t.userId, t.createdAt)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    requestHash: text("request_hash"),
    response: jsonb("response").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idempotency_scope_key_idx").on(t.scope, t.key)],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    status: jobStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    summary: jsonb("summary").$type<Record<string, unknown>>().default({}),
    error: text("error"),
  },
  (t) => [index("job_runs_name_idx").on(t.name, t.startedAt)],
);

// ─── Inferred types ─────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Provider = typeof providers.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type Discount = typeof discounts.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Bundle = typeof bundles.$inferSelect;
export type BundleItem = typeof bundleItems.$inferSelect;
export type EmailDetection = typeof emailDetections.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type ProviderIntegration = typeof providerIntegrations.$inferSelect;
