import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface Transaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  from_branch_id: string;
  to_branch_id: string;
  from_staff_id: string;
  to_staff_id: string;
  amount: number;
  currency: string;
  transfer_method: string;
  status: string;
  confirmation_code: string | null;
  notes: string | null;
  from_branch?: { name: string };
  to_branch?: { name: string };
  from_staff?: { full_name: string };
  to_staff?: { full_name: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { branchId, year, month } = await req.json();

    const reportPeriod = `${year}-${String(month).padStart(2, '0')}`;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    let query = supabase
      .from('transactions')
      .select(`
        *,
        from_branch:branches!transactions_from_branch_id_fkey(name),
        to_branch:branches!transactions_to_branch_id_fkey(name),
        from_staff:profiles!transactions_from_staff_id_fkey(full_name),
        to_staff:profiles!transactions_to_staff_id_fkey(full_name)
      `)
      .gte('transaction_date', startDate.toISOString().split('T')[0])
      .lte('transaction_date', endDate.toISOString().split('T')[0])
      .order('transaction_date', { ascending: true });

    if (branchId) {
      query = query.or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);
    }

    const { data: transactions, error: txError } = await query;

    if (txError) {
      console.error('Transaction query error:', txError);
      throw txError;
    }

    if (!transactions || transactions.length === 0) {
      throw new Error('No transactions found for this period');
    }

    let branchName = 'All Branches';
    if (branchId) {
      const { data: branch } = await supabase
        .from('branches')
        .select('name')
        .eq('id', branchId)
        .single();
      if (branch) branchName = branch.name;
    }

    const pdfBytes = await generatePDF(transactions, branchName, reportPeriod);

    if (!pdfBytes || pdfBytes.length === 0) {
      throw new Error('Failed to generate PDF');
    }

    const fileName = `${branchName.replace(/\s+/g, '_')}_${reportPeriod}.pdf`;
    const filePath = `${reportPeriod}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    const totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const currency = transactions[0]?.currency || 'AFN';

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const { data: report, error: reportError } = await supabase
      .from('generated_reports')
      .insert({
        branch_id: branchId,
        report_type: 'monthly',
        report_period: reportPeriod,
        file_name: fileName,
        file_path: filePath,
        file_size: pdfBytes.length,
        transaction_count: transactions.length,
        total_amount: totalAmount,
        currency: currency,
        generated_by: profileData?.id,
        status: 'completed',
      })
      .select()
      .single();

    if (reportError) {
      console.error('Report insert error:', reportError);
      throw reportError;
    }

    return new Response(
      JSON.stringify({ success: true, report }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating report:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function generatePDF(
  transactions: Transaction[],
  branchName: string,
  reportPeriod: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPosition = pageHeight - margin;

  page.drawText('Monthly Transaction Report', {
    x: margin,
    y: yPosition,
    size: 20,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 30;

  page.drawText(`Branch: ${branchName}`, {
    x: margin,
    y: yPosition,
    size: 12,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPosition -= 20;

  page.drawText(`Period: ${reportPeriod}`, {
    x: margin,
    y: yPosition,
    size: 12,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPosition -= 30;

  const totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const currency = transactions[0]?.currency || 'AFN';

  page.drawText(`Total Transactions: ${transactions.length}`, {
    x: margin,
    y: yPosition,
    size: 11,
    font: boldFont,
  });
  yPosition -= 18;

  page.drawText(`Total Amount: ${totalAmount.toLocaleString()} ${currency}`, {
    x: margin,
    y: yPosition,
    size: 11,
    font: boldFont,
  });
  yPosition -= 35;

  page.drawLine({
    start: { x: margin, y: yPosition },
    end: { x: pageWidth - margin, y: yPosition },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  yPosition -= 20;

  const headers = ['Date', 'TX #', 'From - To', 'Amount', 'Method', 'Status'];
  const columnWidths = [60, 65, 140, 80, 80, 70];
  let xPosition = margin;

  headers.forEach((header, i) => {
    page.drawText(header, {
      x: xPosition,
      y: yPosition,
      size: 9,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    xPosition += columnWidths[i];
  });
  yPosition -= 18;

  for (const transaction of transactions) {
    if (yPosition < margin + 50) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - margin;
    }

    xPosition = margin;
    const date = new Date(transaction.transaction_date).toLocaleDateString('en-GB');

    const fromBranch = transaction.from_branch?.name || 'N/A';
    const toBranch = transaction.to_branch?.name || 'N/A';
    const fromTo = `${fromBranch.substring(0, 10)} - ${toBranch.substring(0, 10)}`;

    const rowData = [
      date,
      transaction.transaction_number.substring(0, 10),
      fromTo.length > 20 ? fromTo.substring(0, 18) + '...' : fromTo,
      `${Number(transaction.amount).toLocaleString()} ${transaction.currency}`,
      transaction.transfer_method.substring(0, 12),
      transaction.status.toUpperCase(),
    ];

    rowData.forEach((data, i) => {
      page.drawText(data, {
        x: xPosition,
        y: yPosition,
        size: 8,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
      });
      xPosition += columnWidths[i];
    });

    yPosition -= 15;
  }

  yPosition -= 10;
  page.drawLine({
    start: { x: margin, y: yPosition },
    end: { x: pageWidth - margin, y: yPosition },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  yPosition -= 20;

  page.drawText(`Generated on: ${new Date().toLocaleString('en-GB')}`, {
    x: margin,
    y: yPosition,
    size: 8,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return await pdfDoc.save();
}
