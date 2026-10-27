CREATE TABLE "access_request" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text,
	"wants_beta" boolean DEFAULT false NOT NULL,
	"notify_free" boolean DEFAULT false NOT NULL,
	"notify_paid" boolean DEFAULT false NOT NULL,
	"ip_hash" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "access_request_email_idx" ON "access_request" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "access_request_ip_idx" ON "access_request" USING btree ("ip_hash","created_at");