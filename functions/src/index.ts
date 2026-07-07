import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

admin.initializeApp();

// Configure the email transport using the default SMTP transport and a GMail account.
// To use this, configure Firebase functions environment variables:
// firebase functions:config:set gmail.email="myusername@gmail.com" gmail.password="secretpassword"
const gmailEmail = functions.config().gmail?.email || process.env.GMAIL_EMAIL;
const gmailPassword = functions.config().gmail?.password || process.env.GMAIL_PASSWORD;

const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailEmail,
    pass: gmailPassword,
  },
});

export const sendAppointmentNotification = functions.firestore
  .document("appointments/{appointmentId}")
  .onCreate(async (snap, context) => {
    const appointment = snap.data();

    const mailOptions = {
      from: `"Hospital Booking System" <${gmailEmail}>`,
      to: "admin@abchospital.com", // Send to hospital administration
      subject: `New Appointment Booking: ${appointment.department}`,
      text: `
        A new appointment has been booked.
        
        Details:
        Patient Name: ${appointment.patientName}
        Phone Number: ${appointment.phoneNumber}
        Department: ${appointment.department}
        Preferred Date: ${appointment.preferredDate}
        Preferred Time: ${appointment.preferredTime}
        
        Please check the admin portal for more details.
      `,
      html: `
        <h2>New Appointment Booking</h2>
        <p>A new appointment has been booked.</p>
        <ul>
          <li><strong>Patient Name:</strong> ${appointment.patientName}</li>
          <li><strong>Phone Number:</strong> ${appointment.phoneNumber}</li>
          <li><strong>Department:</strong> ${appointment.department}</li>
          <li><strong>Preferred Date:</strong> ${appointment.preferredDate}</li>
          <li><strong>Preferred Time:</strong> ${appointment.preferredTime}</li>
        </ul>
        <p>Please check the admin portal for more details.</p>
      `,
    };

    try {
      await mailTransport.sendMail(mailOptions);
      functions.logger.log("New appointment notification email sent to admin!");
      return null;
    } catch (error) {
      functions.logger.error("There was an error while sending the email:", error);
      return null;
    }
  });
