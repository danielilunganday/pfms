CREATE TABLE "overall_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" varchar(7) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"warning_threshold_pct" numeric(5, 2) DEFAULT '80' NOT NULL,
	"critical_threshold_pct" numeric(5, 2) DEFAULT '100' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "borrowers" ALTER COLUMN "national_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "borrowers" ALTER COLUMN "phone_number" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "receipt_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "overall_budgets_period_currency_idx" ON "overall_budgets" USING btree ("period","currency");