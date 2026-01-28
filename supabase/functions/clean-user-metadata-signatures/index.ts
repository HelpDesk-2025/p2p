import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use service role to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { userId } = await req.json();

    if (!userId) {
      throw new Error("userId is required");
    }

    console.log("Cleaning signature from user metadata for user:", userId);

    // Get current user metadata
    const { data: user, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (getUserError) {
      throw new Error(`Failed to get user: ${getUserError.message}`);
    }

    if (!user) {
      throw new Error("User not found");
    }

    // Check if e_sig exists in metadata
    const currentMetadata = user.user.user_metadata || {};

    if (!currentMetadata.e_sig) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No e-signature found in user metadata - already clean"
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Remove e_sig from metadata
    const { e_sig, ...cleanedMetadata } = currentMetadata;

    // Update user with cleaned metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: cleanedMetadata
      }
    );

    if (updateError) {
      throw new Error(`Failed to update user: ${updateError.message}`);
    }

    const removedSize = e_sig.length;
    console.log(`Successfully removed ${removedSize} bytes of e-signature data from user ${userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "E-signature removed from user metadata successfully",
        removedBytes: removedSize,
        userId
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error cleaning user metadata:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
