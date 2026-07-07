import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { appendAppointmentToSheets } from './src/lib/googleSheetsService';

// Configure Nodemailer transporter
// The credentials should be provided via environment variables (.env)
const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_PASSWORD,
  },
});

async function sendAdminNotification(appointment: any) {
  if (!process.env.GMAIL_EMAIL || !process.env.GMAIL_PASSWORD) {
    console.warn("Email credentials missing. Skipping admin notification.");
    return;
  }

  const mailOptions = {
    from: `"Hospital Booking System" <${process.env.GMAIL_EMAIL}>`,
    to: "tydomet@gmail.com",
    subject: `New Appointment Booking: ${appointment.department}`,
    html: `
      <h2>New Appointment Booking</h2>
      <p>A new appointment has been booked.</p>
      <ul>
        <li><strong>Patient Name:</strong> ${appointment.patientName}</li>
        <li><strong>Phone Number:</strong> ${appointment.phoneNumber}</li>
        <li><strong>Department:</strong> ${appointment.department}</li>
        <li><strong>Preferred Date:</strong> ${appointment.preferredDate}</li>
        <li><strong>Preferred Time:</strong> ${appointment.preferredTime || 'N/A'}</li>
      </ul>
      <p>This is an automated booking notification.</p>
    `,
  };

  try {
    await mailTransport.sendMail(mailOptions);
    console.log("Admin notification email sent successfully.");
  } catch (error) {
    console.error("Error sending admin notification email:", error);
  }
}

// Initialize Firebase Admin
let db: Firestore | null = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount)
      });
    }
    db = getFirestore();
    console.log("Firebase Admin initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
  }
} else {
  console.warn("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Database operations will fail.");
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/book", async (req, res) => {
    try {
      const { patientName, phoneNumber, preferredDate, preferredTime, department } = req.body;
      if (!patientName || !phoneNumber || !preferredDate || !department) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (db) {
        const appointmentData = {
          patientName,
          phoneNumber,
          preferredDate,
          preferredTime: preferredTime || 'N/A',
          department,
          createdAt: FieldValue.serverTimestamp()
        };
        await db.collection('appointments').add(appointmentData);
        
        // Trigger email notification
        await sendAdminNotification(appointmentData);

        // Real-time synchronization to linked Google Sheets
        await appendAppointmentToSheets(db, appointmentData);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Booking error:", error);
      res.status(500).json({ error: "Failed to book appointment" });
    }
  });

  app.post("/api/test-email", async (req, res) => {
    try {
      if (!process.env.GMAIL_EMAIL || !process.env.GMAIL_PASSWORD) {
        return res.status(400).json({ 
          success: false, 
          error: "Gmail credentials are missing from environment variables (GMAIL_EMAIL, GMAIL_PASSWORD)." 
        });
      }

      const mockAppointment = {
        patientName: "John Doe (Test)",
        phoneNumber: "+1 (555) 019-9234",
        department: "Cardiology (Automation Test)",
        preferredDate: new Date().toLocaleDateString(),
        preferredTime: "10:30 AM",
      };

      const mailOptions = {
        from: `"Hospital Booking System Test" <${process.env.GMAIL_EMAIL}>`,
        to: "tydomet@gmail.com",
        subject: `[TEST] New Appointment Booking: ${mockAppointment.department}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f172a; margin-top: 0;">Email Automation Active</h2>
            <p style="color: #475569; font-size: 14px;">This is a test notification confirming that email automation is fully functional for ABC Hospital.</p>
            
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; font-size: 14px; color: #334155;">Mock Booking Data:</h3>
              <ul style="list-style-type: none; padding: 0; margin: 0; font-size: 13px; color: #475569; line-height: 1.8;">
                <li><strong>Patient Name:</strong> ${mockAppointment.patientName}</li>
                <li><strong>Phone Number:</strong> ${mockAppointment.phoneNumber}</li>
                <li><strong>Department:</strong> ${mockAppointment.department}</li>
                <li><strong>Preferred Date:</strong> ${mockAppointment.preferredDate}</li>
                <li><strong>Preferred Time:</strong> ${mockAppointment.preferredTime}</li>
              </ul>
            </div>
            
            <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">Sent automatically by the ABC Hospital landing page integration.</p>
          </div>
        `,
      };

      await mailTransport.sendMail(mailOptions);
      res.json({ success: true, message: "Test email successfully sent to tydomet@gmail.com" });
    } catch (error: any) {
      console.error("Test email error:", error);
      let errMsg = error.message || "Failed to send test email";
      if (errMsg.includes("535") || errMsg.includes("Invalid login")) {
        errMsg = "Gmail authentication failed. This is usually because less-secure apps are blocked. Action needed: 1. Enable 2-Step Verification on your Gmail account. 2. Generate a 16-character App Password (go to security.google.com -> App passwords). 3. Update GMAIL_PASSWORD in your environment configuration with this 16-character code.";
      }
      res.status(500).json({ success: false, error: errMsg });
    }
  });

  app.get("/api/appointments", async (req, res) => {
    try {
      if (!db) {
        return res.json([]);
      }
      const snapshot = await db.collection('appointments').orderBy('createdAt', 'desc').get();
      const appointments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date()
      }));
      res.json(appointments);
    } catch (error) {
      console.error("Fetch appointments error:", error);
      res.status(500).json({ error: "Failed to fetch appointments" });
    }
  });

  app.get("/api/forms", async (req, res) => {
    try {
      if (!db) {
        return res.json([]);
      }
      const snapshot = await db.collection('google_forms').orderBy('createdAt', 'desc').get();
      const forms = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date()
      }));
      res.json(forms);
    } catch (error) {
      console.error("Fetch forms error:", error);
      res.status(500).json({ error: "Failed to fetch google forms" });
    }
  });

  app.post("/api/forms", async (req, res) => {
    try {
      const { formId, title, responderUri } = req.body;
      if (!formId || !title) {
        return res.status(400).json({ error: "Missing formId or title" });
      }
      if (db) {
        await db.collection('google_forms').doc(formId).set({
          formId,
          title,
          responderUri,
          createdAt: FieldValue.serverTimestamp()
        });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Save form error:", error);
      res.status(500).json({ error: "Failed to save google form" });
    }
  });

  app.delete("/api/forms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (db) {
        await db.collection('google_forms').doc(id).delete();
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete form error:", error);
      res.status(500).json({ error: "Failed to delete google form" });
    }
  });

  app.get("/api/sheets", async (req, res) => {
    try {
      if (!db) {
        return res.json([]);
      }
      const snapshot = await db.collection('google_sheets').orderBy('createdAt', 'desc').get();
      const sheets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date()
      }));
      res.json(sheets);
    } catch (error) {
      console.error("Fetch sheets error:", error);
      res.status(500).json({ error: "Failed to fetch google sheets" });
    }
  });

  app.post("/api/sheets", async (req, res) => {
    try {
      const { spreadsheetId, title, url } = req.body;
      if (!spreadsheetId || !title) {
        return res.status(400).json({ error: "Missing spreadsheetId or title" });
      }
      if (db) {
        await db.collection('google_sheets').doc(spreadsheetId).set({
          spreadsheetId,
          title,
          url,
          createdAt: FieldValue.serverTimestamp()
        });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Save sheet error:", error);
      res.status(500).json({ error: "Failed to save google sheet" });
    }
  });

  app.delete("/api/sheets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (db) {
        await db.collection('google_sheets').doc(id).delete();
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete sheet error:", error);
      res.status(500).json({ error: "Failed to delete google sheet" });
    }
  });

  app.post("/api/save-token", async (req, res) => {
    try {
      const { accessToken } = req.body;
      if (!accessToken) {
        return res.status(400).json({ error: "Missing accessToken" });
      }
      if (db) {
        await db.collection('google_auth').doc('admin').set({
          accessToken,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Save token error:", error);
      res.status(500).json({ error: "Failed to save OAuth token" });
    }
  });

  app.post("/api/google-proxy", async (req, res) => {
    try {
      const { url, method, body, headers } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Missing url in proxy request" });
      }

      // Allow only googleapis URLs for security
      if (!url.startsWith("https://sheets.googleapis.com/") && !url.startsWith("https://forms.googleapis.com/")) {
        return res.status(403).json({ error: "Only Google Sheets and Forms API requests are allowed through this proxy." });
      }

      const fetchHeaders: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (headers && headers.Authorization) {
        fetchHeaders["Authorization"] = headers.Authorization;
      }

      const options: any = {
        method: method || "GET",
        headers: fetchHeaders
      };

      if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      if (response.ok) {
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          res.json(data);
        } else {
          const text = await response.text();
          res.send(text);
        }
      } else {
        const errorText = await response.text();
        res.status(response.status).send(errorText);
      }
    } catch (error: any) {
      console.error("Google proxy error:", error);
      res.status(500).json({ error: error.message || "Proxy request failed" });
    }
  });

  // AI Chatbot Route for Triage, Inquiries, Appointments
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      
      const today = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const systemInstruction = `You are a helpful, professional, and empathetic AI Assistant for ABC Hospital in Lagos, Ikeja.
Today's date and time is ${today}.
Your role is to assist patients with:
1. General inquiries (location, visiting hours, departments).
2. Appointment scheduling. IMPORTANT: Collect the patient's name, phone number, preferred date, and department. Once you have ALL these details, call the 'schedule_appointment' tool to save the record to the hospital database, and then confirm with the patient.
3. Basic medical triage (understand their symptoms and recommend the appropriate department: e.g., Cardiology, General Practice, Pediatrics, Emergency).
IMPORTANT: Always include a disclaimer that you are an AI and in case of a medical emergency, they should visit the emergency room immediately.
Keep responses concise, warm, and professional.`;

      const contents = messages.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      let response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents,
        config: {
          systemInstruction,
          tools: [{
            functionDeclarations: [
              {
                name: "schedule_appointment",
                description: "Saves a new appointment record to the hospital database.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    patientName: { type: Type.STRING, description: "Full name of the patient" },
                    phoneNumber: { type: Type.STRING, description: "Patient's phone number" },
                    preferredDate: { type: Type.STRING, description: "Preferred date for the appointment" },
                    department: { type: Type.STRING, description: "The hospital department (e.g., Cardiology, General Practice)" }
                  },
                  required: ["patientName", "phoneNumber", "preferredDate", "department"]
                }
              }
            ]
          }]
        },
      });

      let appointmentBooked = false;

      // Handle function calls
      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionCall = response.functionCalls[0];
        if (functionCall.name === "schedule_appointment") {
          const args = functionCall.args as any;
          let resultText = "Success";
          try {
            if (db) {
              const appointmentData = {
                ...args,
                createdAt: FieldValue.serverTimestamp()
              };
              await db.collection('appointments').add(appointmentData);
              console.log("Appointment saved to Firestore:", args);
              appointmentBooked = true;
              
              // Trigger email notification
              await sendAdminNotification(appointmentData);

              // Real-time synchronization to linked Google Sheets
              await appendAppointmentToSheets(db, appointmentData);
            } else {
              throw new Error("Database not initialized");
            }
          } catch (e) {
            console.error("Error saving appointment:", e);
            resultText = "Failed to save appointment due to server error.";
          }
          
          // Send the function result back to Gemini
          contents.push({
            role: "model",
            parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }]
          });
          
          contents.push({
            role: "user",
            parts: [{ functionResponse: { name: functionCall.name, response: { result: resultText } } }]
          });
          
          response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents,
            config: {
              systemInstruction
            }
          });
        }
      }

      res.json({ text: response.text, appointmentBooked });
    } catch (error) {
      console.error("Error generating chat response:", error);
      res.status(500).json({ error: "Failed to generate response." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
