import type { Firestore } from 'firebase-admin/firestore';

interface AppointmentData {
  patientName: string;
  phoneNumber: string;
  preferredDate: string;
  preferredTime: string;
  department: string;
}

/**
 * Appends a newly created appointment to all linked Google Sheets in real-time.
 * This runs on the server after Firestore successfully saves the booking.
 */
export async function appendAppointmentToSheets(db: Firestore | null, appointment: AppointmentData) {
  if (!db) {
    console.warn("[Sheets Service] Database not initialized. Real-time sync skipped.");
    return;
  }

  try {
    // 1. Fetch the saved Admin Access Token
    const authDoc = await db.collection('google_auth').doc('admin').get();
    if (!authDoc.exists) {
      console.warn("[Sheets Service] No Admin Google OAuth token found. Real-time sync skipped. Staff must link their Google Account in the admin portal.");
      return;
    }

    const { accessToken } = authDoc.data() || {};
    if (!accessToken) {
      console.warn("[Sheets Service] Admin Google OAuth token is empty.");
      return;
    }

    // 2. Fetch all linked spreadsheets
    const sheetsSnapshot = await db.collection('google_sheets').get();
    if (sheetsSnapshot.empty) {
      console.info("[Sheets Service] No spreadsheets linked. Real-time sync skipped.");
      return;
    }

    const linkedSheets = sheetsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    console.log(`[Sheets Service] Syncing appointment to ${linkedSheets.length} linked spreadsheets...`);

    // 3. For each linked sheet, append the appointment details
    for (const sheet of linkedSheets) {
      const spreadsheetId = sheet.spreadsheetId;
      if (!spreadsheetId) continue;

      try {
        // Fetch sheet metadata to determine first sheet tab title (usually 'Sheet1')
        const metadataRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        let sheetName = 'Sheet1';
        if (metadataRes.ok) {
          const metadata = await metadataRes.json();
          sheetName = metadata.sheets?.[0]?.properties?.title || 'Sheet1';
        }

        // Formulate row values matching the ledger layout:
        // [Patient Name, Phone Number, Department, Preferred Date, Preferred Time, Log/Sync Time]
        const rowValues = [[
          appointment.patientName,
          appointment.phoneNumber,
          appointment.department,
          appointment.preferredDate,
          appointment.preferredTime || 'N/A',
          new Date().toLocaleString()
        ]];

        // Append the row to the sheet
        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A:F:append?valueInputOption=USER_ENTERED`;
        const appendRes = await fetch(appendUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: rowValues
          })
        });

        if (appendRes.ok) {
          console.log(`[Sheets Service] Successfully appended appointment to sheet "${sheet.title || spreadsheetId}" tab "${sheetName}"`);
        } else {
          const errorDetails = await appendRes.text();
          console.error(`[Sheets Service] Failed to append to spreadsheet ${spreadsheetId}. Response:`, errorDetails);
        }
      } catch (sheetError) {
        console.error(`[Sheets Service] Error syncing to spreadsheet ${spreadsheetId}:`, sheetError);
      }
    }
  } catch (error) {
    console.error("[Sheets Service] Fatal error in real-time append:", error);
  }
}
