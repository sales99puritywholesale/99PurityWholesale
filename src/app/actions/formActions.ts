'use server';

import { Resend } from 'resend';

// Initialize Resend client with API Key
const resendApiKey = process.env.RESEND_API_KEY;
const resend = new Resend(resendApiKey);

// Recipient email address configured by the user (supports comma-separated list of emails)
const notificationEmailInput = process.env.NOTIFICATION_EMAIL || 'sales@99puritywholesale.com,kylefbelk@gmail.com';
const notificationEmails = notificationEmailInput.split(',').map(email => email.trim()).filter(Boolean);

// Sender address - onboarding@resend.dev is the default Resend sandbox sender
const senderEmail = process.env.SENDER_EMAIL || 'onboarding@resend.dev';

// Google Sheets URL for logging leads
const leadsSheetUrl = process.env.LEADS_SHEET_URL;

async function sendToGoogleSheets(data: any) {
  if (!leadsSheetUrl) return;
  try {
    const response = await fetch(leadsSheetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      console.error('Failed to send lead to Google Sheets:', await response.text());
    }
  } catch (error) {
    console.error('Error sending lead to Google Sheets:', error);
  }
}

export async function submitContactForm(prevState: any, formData: FormData) {
  try {
    if (!resendApiKey) {
      console.error('RESEND_API_KEY environment variable is not defined.');
      return { 
        success: false, 
        error: 'The server email credentials are not configured. Please add RESEND_API_KEY to your environment.' 
      };
    }

    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const message = formData.get('message') as string;

    // Server-side basic validation
    if (!name || !email || !message) {
      return { success: false, error: 'Please fill out all required fields.' };
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>New Inquiry</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f9; color: #1e1e1e; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .header { background-color: #13a7b7; padding: 24px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
            .content { padding: 32px; }
            .row { display: flex; border-bottom: 1px solid #edf2f7; padding: 12px 0; }
            .label { width: 180px; font-weight: 600; color: #4a5568; font-size: 13px; text-transform: uppercase; letter-spacing: 0.02em; }
            .value { flex: 1; color: #1a202c; font-size: 14px; }
            .footer { background: #f7fafc; padding: 16px; text-align: center; border-top: 1px solid #edf2f7; font-size: 11px; color: #a0aec0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Contact Inquiry</h1>
            </div>
            <div class="content">
              <div class="row">
                <div class="label">Name</div>
                <div class="value">${name}</div>
              </div>
              <div class="row">
                <div class="label">Email Address</div>
                <div class="value"><a href="mailto:${email}">${email}</a></div>
              </div>
              <div class="row">
                <div class="label">Phone Number</div>
                <div class="value">${phone || 'Not provided'}</div>
              </div>
              <div class="row" style="border-bottom: none; flex-direction: column; padding-top: 16px;">
                <div class="label" style="width: 100%; margin-bottom: 8px;">Message</div>
                <div class="value" style="background: #f7fafc; padding: 12px; border-radius: 8px; border: 1px solid #edf2f7; white-space: pre-wrap;">${message}</div>
              </div>
            </div>
            <div class="footer">
              Submitted via 99 Purity B2B Wholesale Portal
            </div>
          </div>
        </body>
      </html>
    `;

    const data = await resend.emails.send({
      from: `99 Purity Wholesale Leads <${senderEmail}>`,
      to: notificationEmails,
      subject: `New Contact Inquiry - ${name}`,
      html: htmlContent,
    });

    if (data.error) {
      console.error('Resend email error:', data.error);
      return { success: false, error: data.error.message };
    }

    // Append lead to Google Sheets in the background
    await sendToGoogleSheets({
      formType: 'contact',
      name,
      email,
      phone,
      message,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Contact submission error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}

export async function submitWholesaleForm(prevState: any, formData: FormData) {
  try {
    if (!resendApiKey) {
      console.error('RESEND_API_KEY environment variable is not defined.');
      return { 
        success: false, 
        error: 'The server email credentials are not configured. Please add RESEND_API_KEY to your environment.' 
      };
    }

    const businessName = formData.get('businessName') as string;
    const businessType = formData.get('businessType') as string;
    const fullName = formData.get('fullName') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const state = formData.get('state') as string;
    const monthlyVolume = formData.get('monthlyVolume') as string;
    const products = formData.get('products') as string;
    const contactMethod = formData.get('contactMethod') as string;
    const notes = formData.get('notes') as string;
    const attestation = formData.get('attestation') as string;

    // Server-side basic validation
    if (!businessName || !businessType || !fullName || !email || !state || !monthlyVolume || !products || !attestation) {
      return { success: false, error: 'Please fill out all required fields and accept the attestation.' };
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>New Wholesale Application</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f9; color: #1e1e1e; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .header { background-color: #13a7b7; padding: 24px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
            .content { padding: 32px; }
            .row { display: flex; border-bottom: 1px solid #edf2f7; padding: 12px 0; }
            .label { width: 180px; font-weight: 600; color: #4a5568; font-size: 13px; text-transform: uppercase; letter-spacing: 0.02em; }
            .value { flex: 1; color: #1a202c; font-size: 14px; }
            .footer { background: #f7fafc; padding: 16px; text-align: center; border-top: 1px solid #edf2f7; font-size: 11px; color: #a0aec0; }
            .badge { display: inline-block; padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; background-color: #c6f6d5; color: #22543d; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Wholesale B2B Application</h1>
            </div>
            <div class="content">
              <div class="row">
                <div class="label">Business Name</div>
                <div class="value">${businessName}</div>
              </div>
              <div class="row">
                <div class="label">Business Type</div>
                <div class="value">${businessType}</div>
              </div>
              <div class="row">
                <div class="label">Representative Name</div>
                <div class="value">${fullName}</div>
              </div>
              <div class="row">
                <div class="label">Email Address</div>
                <div class="value"><a href="mailto:${email}">${email}</a></div>
              </div>
              <div class="row">
                <div class="label">Phone Number</div>
                <div class="value">${phone || 'Not provided'}</div>
              </div>
              <div class="row">
                <div class="label">Location (State)</div>
                <div class="value">${state}</div>
              </div>
              <div class="row">
                <div class="label">Est. Monthly Volume</div>
                <div class="value">${monthlyVolume}</div>
              </div>
              <div class="row">
                <div class="label">Preferred Contact</div>
                <div class="value">${contactMethod || 'Not specified'}</div>
              </div>
              <div class="row">
                <div class="label">Attestation Approved</div>
                <div class="value"><span class="badge">Approved</span> Checked</div>
              </div>
              <div class="row" style="flex-direction: column; padding-top: 16px;">
                <div class="label" style="width: 100%; margin-bottom: 8px;">Compounds of Interest</div>
                <div class="value" style="background: #f7fafc; padding: 12px; border-radius: 8px; border: 1px solid #edf2f7; white-space: pre-wrap; margin-bottom: 12px;">${products}</div>
              </div>
              ${notes ? `
              <div class="row" style="border-bottom: none; flex-direction: column; padding-top: 12px;">
                <div class="label" style="width: 100%; margin-bottom: 8px;">Additional Notes</div>
                <div class="value" style="background: #f7fafc; padding: 12px; border-radius: 8px; border: 1px solid #edf2f7; white-space: pre-wrap;">${notes}</div>
              </div>
              ` : ''}
            </div>
            <div class="footer">
              Submitted via 99 Purity B2B Wholesale Portal
            </div>
          </div>
        </body>
      </html>
    `;

    const data = await resend.emails.send({
      from: `99 Purity Wholesale Application <${senderEmail}>`,
      to: notificationEmails,
      subject: `New Wholesale Application - ${businessName}`,
      html: htmlContent,
    });

    if (data.error) {
      console.error('Resend email error:', data.error);
      return { success: false, error: data.error.message };
    }

    // Append lead to Google Sheets in the background
    await sendToGoogleSheets({
      formType: 'wholesale',
      businessName,
      businessType,
      fullName,
      email,
      phone,
      state,
      monthlyVolume,
      products,
      contactMethod,
      notes,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Wholesale submission error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
