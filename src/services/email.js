// nodemailer is a module for Node.js applications to allow easy email sending. 


require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.EMAIL_USER,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
  },
});

// Verify the connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

// Function to send email
const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Delvadiya's Bank" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

async function sendRegistrationEmail(userEmail, name) {
  const subject = 'Welcome to Delvadiya\'s Bank!';
  const text = `Hi ${name},\n\nThank you for registering with Delvadiya's Bank. We're excited to have you on board!\n\nBest regards,\nDelvadiya's Bank Team`;
  const html = `<p>Hi ${name},</p><p>Thank you for registering with <strong>Delvadiya's Bank</strong>. We're excited to have you on board!</p><p>Best regards,<br/>Delvadiya's Bank Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionEmail(userEmail, name, amount,toAccount) {
  const subject = 'Transaction Alert from Delvadiya\'s Bank';
  const text = `Hi ${name},\n\nA transaction of $${amount} has been made to account ${toAccount}. If you did not authorize this transaction, please contact us immediately.\n\nBest regards,\nDelvadiya's Bank Team`;
  const html = `<p>Hi ${name},</p><p>A transaction of <strong>$${amount}</strong> has been made to account <strong>${toAccount}</strong>. If you did not authorize this transaction, please contact us immediately.</p><p>Best regards,<br/>Delvadiya's Bank Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionfailedEmail(userEmail, name, amount,toAccount) {
  const subject = 'Transaction Failed Alert from Delvadiya\'s Bank';
  const text = `Hi ${name},\n\nA transaction of $${amount} to account ${toAccount} has failed. Please check your account balance and try again.\n\nBest regards,\nDelvadiya's Bank Team`;
  const html = `<p>Hi ${name},</p><p>A transaction of <strong>$${amount}</strong> to account <strong>${toAccount}</strong> has failed. Please check your account balance and try again.</p><p>Best regards,<br/>Delvadiya's Bank Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}


module.exports = { sendRegistrationEmail, sendTransactionEmail, sendTransactionfailedEmail, sendEmail};
