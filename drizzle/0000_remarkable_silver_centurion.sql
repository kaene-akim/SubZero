CREATE TYPE "public"."activation_method" AS ENUM('coordinated_checkout', 'provider_api', 'manual');--> statement-breakpoint
CREATE TYPE "public"."activation_status" AS ENUM('awaiting_activation', 'scheduled', 'ready_for_checkout', 'awaiting_user_action', 'processing', 'activated', 'failed', 'requires_attention', 'cannot_synchronize', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."auth_token_type" AS ENUM('email_verify', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."billing_frequency" AS ENUM('weekly', 'fortnightly', 'monthly', 'quarterly', 'semiannual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."bundle_status" AS ENUM('draft', 'scheduled', 'activating', 'completed', 'partially_failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."cancellation_status" AS ENUM('none', 'requested', 'pending', 'confirmed', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."integration_config_status" AS ENUM('not_configured', 'configured', 'live', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."matching_status" AS ENUM('unmatched', 'possible', 'matched', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."offer_type" AS ENUM('free_trial', 'introductory_price', 'free_plan', 'standard_plan', 'discount');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'requires_action', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'auto_confirmed', 'confirmed', 'rejected', 'merged');--> statement-breakpoint
CREATE TYPE "public"."subscription_source" AS ENUM('manual', 'gmail', 'bank', 'bundle', 'demo');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'paused', 'pending_cancellation', 'cancelled', 'expired', 'payment_failed');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('verified', 'recently_checked', 'unverified', 'expired');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "auth_token_type" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "bundle_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"provider_id" uuid,
	"offer_id" uuid,
	"subscription_id" uuid,
	"activation_status" "activation_status" DEFAULT 'awaiting_activation' NOT NULL,
	"activation_method" "activation_method" DEFAULT 'coordinated_checkout' NOT NULL,
	"scheduled_activation_date" date,
	"expected_renewal_date" date,
	"actual_renewal_date" date,
	"scheduling" jsonb DEFAULT '{}'::jsonb,
	"status_reason" text,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_items_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "bundle_status" DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"timezone" text DEFAULT 'Europe/London' NOT NULL,
	"preferred_activation_date" date,
	"target_billing_date" date,
	"notes" text,
	"idempotency_key" text,
	"activation_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundles_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text,
	"account_label" text,
	"encrypted_credentials" jsonb NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"connection_status" text DEFAULT 'connected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"sync_cursor" text,
	"last_error" text,
	"consent_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"original_price" numeric(14, 2) NOT NULL,
	"discounted_price" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"discount_percentage" numeric(5, 2) NOT NULL,
	"billing_frequency" "billing_frequency" DEFAULT 'monthly' NOT NULL,
	"promotional_code" text,
	"eligibility" text,
	"duration_months" integer,
	"expiration_date" date,
	"redemption_url" text NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"verification_note" text,
	"last_verified_at" timestamp with time zone,
	"is_student" boolean DEFAULT false NOT NULL,
	"new_customers_only" boolean DEFAULT false NOT NULL,
	"existing_customers_only" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_detections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connected_account_id" uuid,
	"provider_id" uuid,
	"subscription_id" uuid,
	"gmail_message_id" text NOT NULL,
	"thread_id" text,
	"subject" text NOT NULL,
	"sender" text NOT NULL,
	"snippet" text,
	"received_at" timestamp with time zone,
	"classification" text NOT NULL,
	"extracted_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence_score" numeric(4, 2) NOT NULL,
	"confidence_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"classifier_version" text DEFAULT 'rules-v1' NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" text NOT NULL,
	"as_of" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"user_id" uuid,
	"request_hash" text,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"bundle_id" uuid,
	"notification_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"channels" text[] DEFAULT '{in_app}'::text[] NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"dedupe_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"mode" text NOT NULL,
	"user_id" uuid,
	"redirect_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid,
	"discount_id" uuid,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer,
	"status" "verification_status" NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"offer_type" "offer_type" NOT NULL,
	"trial_duration_days" integer,
	"initial_price" numeric(14, 2),
	"initial_currency" text DEFAULT 'GBP' NOT NULL,
	"renewal_price" numeric(14, 2) NOT NULL,
	"renewal_currency" text DEFAULT 'GBP' NOT NULL,
	"billing_frequency" "billing_frequency" DEFAULT 'monthly' NOT NULL,
	"payment_method_required" boolean DEFAULT true NOT NULL,
	"cancellation_requirements" text,
	"eligibility" text,
	"country_availability" text[] DEFAULT '{GB}'::text[] NOT NULL,
	"registration_url" text NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"verification_note" text,
	"last_verified_at" timestamp with time zone,
	"expiration_date" date,
	"is_student" boolean DEFAULT false NOT NULL,
	"is_exclusive" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"bundle_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"payment_provider" text DEFAULT 'none' NOT NULL,
	"transaction_reference" text,
	"description" text,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid,
	"subscription_id" uuid,
	"user_id" uuid NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"billing_frequency" "billing_frequency" NOT NULL,
	"source" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"integration_type" text DEFAULT 'coordinated_checkout' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"configuration_status" "integration_config_status" DEFAULT 'not_configured' NOT NULL,
	"supported_operations" text[] DEFAULT '{}'::text[] NOT NULL,
	"docs_url" text,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_integrations_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"service_family" text,
	"description" text,
	"website" text NOT NULL,
	"logo_url" text,
	"brand_color" text DEFAULT '#1F2937' NOT NULL,
	"cancellation_url" text,
	"management_url" text,
	"integration_type" text DEFAULT 'coordinated_checkout' NOT NULL,
	"availability_status" text DEFAULT 'available' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" uuid,
	"service_name" text NOT NULL,
	"category" text DEFAULT 'Other Services' NOT NULL,
	"price" numeric(14, 2),
	"currency" text DEFAULT 'GBP' NOT NULL,
	"billing_frequency" "billing_frequency" DEFAULT 'monthly' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"start_date" date,
	"next_billing_date" date,
	"trial_start_date" date,
	"trial_end_date" date,
	"renewal_price" numeric(14, 2),
	"renewal_currency" text DEFAULT 'GBP' NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"management_url" text,
	"cancellation_url" text,
	"cancellation_instructions" text,
	"cancellation_status" "cancellation_status" DEFAULT 'none' NOT NULL,
	"cancellation_requested_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_confirmed_at" timestamp with time zone,
	"source" "subscription_source" DEFAULT 'manual' NOT NULL,
	"confidence_score" numeric(4, 2),
	"dedupe_key" text,
	"notes" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" uuid,
	"matched_subscription_id" uuid,
	"external_id" text NOT NULL,
	"merchant_name" text NOT NULL,
	"merchant_reference" text,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"transaction_date" date NOT NULL,
	"frequency_guess" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"matching_status" "matching_status" DEFAULT 'unmatched' NOT NULL,
	"source" text DEFAULT 'truelayer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"country" text DEFAULT 'GB' NOT NULL,
	"preferred_currency" text DEFAULT 'GBP' NOT NULL,
	"timezone" text DEFAULT 'Europe/London' NOT NULL,
	"monthly_budget" numeric(14, 2),
	"preferred_billing_day" integer DEFAULT 1 NOT NULL,
	"student_eligible" boolean DEFAULT false NOT NULL,
	"preferred_billing_frequency" "billing_frequency" DEFAULT 'monthly' NOT NULL,
	"interested_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"onboarding_step" text DEFAULT 'welcome' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_push" boolean DEFAULT false NOT NULL,
	"notify_in_app" boolean DEFAULT true NOT NULL,
	"trial_reminder_days" integer[] DEFAULT '{7,3,1}'::integer[] NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "watched_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_detections" ADD CONSTRAINT "email_detections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_detections" ADD CONSTRAINT "email_detections_connected_account_id_connected_accounts_id_fk" FOREIGN KEY ("connected_account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_detections" ADD CONSTRAINT "email_detections_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_detections" ADD CONSTRAINT "email_detections_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_verifications" ADD CONSTRAINT "offer_verifications_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_verifications" ADD CONSTRAINT "offer_verifications_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_integrations" ADD CONSTRAINT "provider_integrations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_records" ADD CONSTRAINT "transaction_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_records" ADD CONSTRAINT "transaction_records_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_records" ADD CONSTRAINT "transaction_records_matched_subscription_id_subscriptions_id_fk" FOREIGN KEY ("matched_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_discounts" ADD CONSTRAINT "watched_discounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_discounts" ADD CONSTRAINT "watched_discounts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_type_idx" ON "auth_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_items_bundle_offer_idx" ON "bundle_items" USING btree ("bundle_id","offer_id");--> statement-breakpoint
CREATE INDEX "bundle_items_bundle_idx" ON "bundle_items" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "bundles_user_idx" ON "bundles" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_accounts_user_provider_idx" ON "connected_accounts" USING btree ("user_id","provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "connected_accounts_user_idx" ON "connected_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discounts_provider_idx" ON "discounts" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_provider_title_idx" ON "discounts" USING btree ("provider_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "email_detections_user_message_idx" ON "email_detections" USING btree ("user_id","gmail_message_id");--> statement-breakpoint
CREATE INDEX "email_detections_user_review_idx" ON "email_detections" USING btree ("user_id","review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_pair_date_idx" ON "exchange_rates" USING btree ("base","quote","as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_key_idx" ON "idempotency_keys" USING btree ("scope","key");--> statement-breakpoint
CREATE INDEX "job_runs_name_idx" ON "job_runs" USING btree ("name","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_idx" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_status_idx" ON "notifications" USING btree ("user_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "offer_verifications_offer_idx" ON "offer_verifications" USING btree ("offer_id","checked_at");--> statement-breakpoint
CREATE INDEX "offers_provider_idx" ON "offers" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "offers_active_idx" ON "offers" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_provider_title_idx" ON "offers" USING btree ("provider_id","title");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "price_history_subscription_idx" ON "price_history" USING btree ("subscription_id","recorded_at");--> statement-breakpoint
CREATE INDEX "providers_category_idx" ON "providers" USING btree ("category");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_next_billing_idx" ON "subscriptions" USING btree ("next_billing_date");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_dedupe_idx" ON "subscriptions" USING btree ("user_id","dedupe_key") WHERE "subscriptions"."dedupe_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_records_external_idx" ON "transaction_records" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "transaction_records_user_idx" ON "transaction_records" USING btree ("user_id","transaction_date");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watched_discounts_user_provider_idx" ON "watched_discounts" USING btree ("user_id","provider_id");