const express = require('express');
const cors = require('cors');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sqlite3 = require('sqlite3').verbose();  // SQLite3 database
const fs = require('fs');  // For file existence check
const { parsePhoneNumberFromString } = require('libphonenumber-js');


const app = express();
const port = process.env.PORT || 3000;

// CORS middleware to allow requests from any origin
app.use(cors({
  origin: '*',  // Allows all origins. You can customize this as needed
  methods: ['GET', 'POST'],  // Allow specific methods if necessary
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Path to the SQLite database file
const dbPath = './database2.db';

// Check if the database file exists, create a new one if not
if (!fs.existsSync(dbPath)) {
  console.log("Database file does not exist, creating a new one...");
} else {
  console.log("Database file exists.");
}

// Initialize SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('SQLite database opened');
  }
});

// Create the user_durations table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS user_durations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,  -- The formatted phone number
    notify_name TEXT,   -- The display name (notifyName)
    total_duration INTEGER NOT NULL DEFAULT 0,
    last_timestamp INTEGER NOT NULL,
    UNIQUE(name)
  );
`, (err) => {
  if (err) {
    console.error('Error creating table:', err);
  } else {
    console.log('Table "user_durations" is ready.');
  }
});

// Initialize WhatsApp client
const client = new Client();
let qrCodeData = null;
let isWhatsAppReady = false;

// Handle QR code generation
client.on('qr', (qr) => {
  console.log("QR Code generated: ", qr);
  qrCodeData = qr;
  qrcode.generate(qr, { small: true });  // Log QR code to terminal
});

// Handle WhatsApp client ready event
client.on('ready', () => {
  console.log('WhatsApp is ready!');
  isWhatsAppReady = true;
});

// Handle WhatsApp client authentication failure
client.on('auth_failure', () => {
  console.error('Authentication failed!');
  isWhatsAppReady = false;
});

// Initialize the WhatsApp client
client.initialize();

// Function to insert or update the user's data in the database
// const saveOrUpdateUser = (name, notifyName, duration, timestamp) => {
//   console.log(name, notifyName, duration, timestamp);

//   // Check if the user already exists and update the duration
//   db.get('SELECT * FROM user_durations WHERE name = ?', [name], (err, row) => {
//     if (err) {
//       console.error('Error checking user in database:', err);
//     }

//     if (row) {
//       const newTotalDuration = row.total_duration + duration;
//       db.run(
//         'UPDATE user_durations SET total_duration = ?, last_timestamp = ?, notify_name = ? WHERE name = ?',
//         [newTotalDuration, timestamp, notifyName, name],
//         (err) => {
//           if (err) {
//             console.error('Error updating user in database:', err);
//           } else {
//             console.log(`Updated duration for ${name} (${notifyName}). New total duration: ${newTotalDuration}`);
//           }
//         }
//       );
//     } else {
//       db.run(
//         'INSERT INTO user_durations (name, notify_name, total_duration, last_timestamp) VALUES (?, ?, ?, ?)',
//         [name, notifyName, duration, timestamp],
//         (err) => {
//           if (err) {
//             console.error('Error inserting user into database:', err);
//           } else {
//             console.log(`Inserted new user ${name} (${notifyName}) with total duration: ${duration}`);
//           }
//         }
//       );
//     }
//   });
// };


client.on('message', async (message) => {
  // Check if the message is a voice message (PTT) and not sent by the bot (message.fromMe === false)
  if (message.type === 'ptt' && !message.fromMe) {
    let name = message.from;  // Get the sender's phone number in the format: '923290730770@c.us'
    const timestamp = message.timestamp;  // Message timestamp in seconds

    // Remove the '@c.us' part from the name to get the phone number
    name = name.replace('@c.us', '');

    // Fetch contact information by phone number
    try {
      const contact = await client.getContactById(name + '@c.us');  // Adding '@c.us' to search for the contact
      
      // Use the contact's pushname (display name) if available, otherwise fallback to the phone number
      const notifyName = contact.pushname || name;

      // Format the phone number using libphonenumber (optional for professional formatting)
      const phoneNumber = parsePhoneNumberFromString(name, 'PK');  // 'PK' is the default country code, change it if needed
      let formattedName = name;  // Fallback to raw number if formatting fails

      if (phoneNumber) {
        formattedName = phoneNumber.formatNational(); // Formats the number in a national format (e.g., (123) 456-7890)
      }

      const duration = parseInt(message.duration, 10);  // Parse the duration of the voice message in seconds

      // Log the received message details for debugging
      console.log('Received voice message:', {
        name: name,                // Raw phone number (before formatting)
        notifyName: notifyName,    // Formatted display name or fallback
        duration: duration,        // Duration of the voice message in seconds
        timestamp: timestamp,      // Message timestamp
      });

      // Save or update the user's data with the new voice message duration
      saveOrUpdateUser(name, notifyName, duration, timestamp);

    } catch (err) {
      console.error('Error fetching contact information:', err);
    }
  }
});


// Function to insert or update the user's data in the database
const saveOrUpdateUser = (name, notifyName, duration, timestamp) => {
  console.log(`Checking user ${name} in database...`);

  // Check if the user already exists and update the duration
  db.get('SELECT * FROM user_durations WHERE name = ?', [name], (err, row) => {
    if (err) {
      console.error('Error checking user in database:', err);
    }

    if (row) {
      // User exists, update their total duration
      const newTotalDuration = row.total_duration + duration;
      db.run(
        'UPDATE user_durations SET total_duration = ?, last_timestamp = ?, notify_name = ? WHERE name = ?',
        [newTotalDuration, timestamp, notifyName, name],
        (err) => {
          if (err) {
            console.error('Error updating user in database:', err);
          } else {
            console.log(`Updated duration for ${name} (${notifyName}). New total duration: ${newTotalDuration}`);
          }
        }
      );
    } else {
      // User does not exist, insert a new record
      db.run(
        'INSERT INTO user_durations (name, notify_name, total_duration, last_timestamp) VALUES (?, ?, ?, ?)',
        [name, notifyName, duration, timestamp],
        (err) => {
          if (err) {
            console.error('Error inserting user into database:', err);
          } else {
            console.log(`Inserted new user ${name} (${notifyName}) with duration: ${duration}`);
          }
        }
      );
    }
  });
};


// Endpoint to fetch WhatsApp messages and process them
app.get('/messages', (req, res) => {
  client.getChats()
    .then(chats => {
      const result = chats.map(chat => {
        const lastMessage = chat.lastMessage;
        
        // Initialize the result object
        let response = {
          name: chat.name,
          totalDuration: 0,
          timestamp: null  // Initialize timestamp as null
        };

        // If there's a last message, check for its type and duration
        if (lastMessage && lastMessage.type === 'ptt' && !lastMessage.fromMe) {
          // Only consider received voice messages
          const duration = parseInt(lastMessage.duration, 10);  // Duration in seconds
          response.totalDuration = duration;

          // Get the timestamp and convert it to Pakistani local time format
          const timestamp = new Date(lastMessage.timestamp * 1000);  // Convert from Unix timestamp to Date
          response.timestamp = timestamp.toLocaleString('en-PK', {  // 'en-PK' is for Pakistani format
            timeZone: 'Asia/Karachi',
            hour12: true,
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });

          // Save or update user in the database
          saveOrUpdateUser(chat.name, response.totalDuration, lastMessage.timestamp);
        }

        // If no voice message or sent message, return the name with zero duration and null timestamp
        return response;
      });

      console.log("Chats with durations and timestamps:", result);
      res.json(result);  // Send the result as JSON
    })
    .catch(error => {
      console.error("Error fetching chats:", error);
      res.status(500).json({ error: "Failed to fetch chats" });
    });
});

// Endpoint to get the user durations from the database
app.get('/user_durations', (req, res) => {
  db.all('SELECT * FROM user_durations', [], (err, rows) => {
    if (err) {
      console.error('Error fetching data from database:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.json(rows); // Send back the user durations as JSON
    }
  });
});

// Define the `/whatsapp-status` endpoint
app.get('/whatsapp-status', (req, res) => {
  if (isWhatsAppReady) {
    res.json({ status: 'ready' });
  } else {
    res.json({ status: 'not_ready' });
  }
});

// Endpoint to get the current QR code (returns QR code data as a response)
app.get('/qrcode', (req, res) => {
  if (qrCodeData) {
    // If QR code data exists, send it back to the user
    res.json({ qr: qrCodeData });
  } else {
    // If QR code has not been generated yet, respond with a message
    res.status(404).json({ error: 'QR code not generated yet' });
  }
});

// Start the server on localhost to listen on the local network interface
app.listen(port, '0.0.0.0', () => {
  console.log(`HTTP server is running on http://localhost:${port}`);
});
