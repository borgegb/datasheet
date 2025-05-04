// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow requests from any origin (adjust for production!)
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", // Add allowed methods
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
