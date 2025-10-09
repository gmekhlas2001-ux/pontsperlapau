import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const cronSecret = req.headers.get('X-Cron-Secret');
    const expectedCronSecret = Deno.env.get('CRON_SECRET') || 'your-secure-cron-secret';

    if (cronSecret !== expectedCronSecret) {
      throw new Error('Unauthorized: Invalid cron secret');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: branches, error: branchError } = await supabase
      .from('branches')
      .select('id, name')
      .order('name');

    if (branchError) {
      console.error('Error fetching branches:', branchError);
      throw branchError;
    }

    const generateReportUrl = `${supabaseUrl}/functions/v1/generate-monthly-reports`;
    const results = [];

    const allBranchesResult = await fetch(generateReportUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': cronSecret,
      },
      body: JSON.stringify({
        branchId: null,
        isAutomated: true,
      }),
    });

    const allBranchesData = await allBranchesResult.json();
    results.push({
      branch: 'All Branches',
      success: allBranchesResult.ok,
      ...allBranchesData,
    });

    for (const branch of branches || []) {
      try {
        const response = await fetch(generateReportUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Cron-Secret': cronSecret,
          },
          body: JSON.stringify({
            branchId: branch.id,
            isAutomated: true,
          }),
        });

        const data = await response.json();
        results.push({
          branch: branch.name,
          success: response.ok,
          ...data,
        });
      } catch (error) {
        results.push({
          branch: branch.name,
          success: false,
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Monthly reports generation completed',
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in monthly report scheduler:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
