CREATE TABLE "monitors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"check_interval" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "check_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitor_id" integer NOT NULL,
	"status_code" integer,
	"response_time_ms" integer,
	"is_up" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"checked_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_check_results_monitor_id" ON "check_results" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "idx_check_results_checked_at" ON "check_results" USING btree ("checked_at");