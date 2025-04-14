const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs'); 
const chokidar = require('chokidar'); //
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the public directory
app.use(express.static('public'));

const messagesFilePath = 'messages.txt';
const readMessagesFromFile = () => {
    if (fs.existsSync(messagesFilePath)) {
        const data = fs.readFileSync(messagesFilePath, 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        return lines.map(line => JSON.parse(line));
    }
    return [];
};

// Watch for changes in messages.txt
chokidar.watch(messagesFilePath).on('change', () => {
    console.log('messages.txt has been updated');
    const messages = readMessagesFromFile();
    io.emit('update messages', messages); // Emit updated messages to all clients
});



io.on('connection', (socket) => {
    console.log('A user connected');

    const initialMessages = readMessagesFromFile();
    socket.emit('update messages', initialMessages);

    

    socket.on('chat message', ({ msg, user , to }) => {
        console.log('Message received: ' + msg);
        
        const messageObject = {
            from: user, // Use the actual username from the client
            message: msg,
            to: to,
            dateCreated: new Date().toISOString()
        };
    
        const messageString = JSON.stringify(messageObject) + '\n';
        fs.appendFile('messages.txt', messageString, (err) => {
            if (err) {
                console.error('Error saving message:', err);
            }
        });
    
        // Broadcast the message to all clients
        io.emit('chat message', msg);
    });
    

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});



app.get('/fetch-messages', (req, res) => {
    if (fs.existsSync('messages.txt')) {
        fs.readFile('messages.txt', 'utf8', (err, data) => {
            if (err) {
                return res.status(500).json({ error: 'Error reading messages' });
            }
            const lines = data.split('\n').filter(line => line.trim() !== '');
            const messages = lines.map(line => JSON.parse(line));
            res.json(messages);
        });
    } else {
        res.json([]); 
    }
});


// ADD NEW

// New route to update a message
app.put('/update-message', (req, res) => {
    const { id, newMessage, newEmoji } = req.body; // Expecting an ID, new message text, and new emoji
    const dateUpdated = new Date().toISOString(); // Use ISO format for consistency

    // Read existing messages from the file
    fs.readFile('messages.txt', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading messages');
        }

        // Parse the existing messages
        const messages = data.split('\n').filter(line => line).map(line => JSON.parse(line));

        // Find the index of the message to update by ID
        const messageIndex = messages.findIndex(msg => msg.id === id); // Assuming each message has a unique ID

        if (messageIndex !== -1) {
            // Update the message text and emoji
            messages[messageIndex].message = newMessage; // Update the message text
            messages[messageIndex].emoji = newEmoji; // Update the emoji
            messages[messageIndex].dateUpdated = dateUpdated; // Update the dateUpdated field

            // Write the updated messages back to the file
            fs.writeFile('messages.txt', messages.map(msg => JSON.stringify(msg)).join('\n'), (err) => {
                if (err) {
                    return res.status(500).send('Error saving updated message');
                }
                res.sendStatus(200); // Respond with success
            });
        } else {
            res.status(404).send('Message not found'); // Handle case where message is not found
        }
    });
});


app.get('/fetch-messages', (req, res) => {
    const { friend, user } = req.query; // Get friend and user from query parameters

    if (fs.existsSync('messages.txt')) {
        fs.readFile('messages.txt', 'utf8', (err, data) => {
            if (err) {
                return res.status(500).json({ error: 'Error reading messages' });
            }
            console.log('Raw data from messages.txt:', data);
            const lines = data.split('\n').filter(line => line.trim() !== '');
            const messages = [];

            // Parse each line as JSON
            for (const line of lines) {
                try {
                    const message = JSON.parse(line);
                    // Filter messages based on the friend and user
                    if ((message.to === friend && message.from === user) || 
                        (message.to === user && message.from === friend)) {
                        messages.push(message);
                    }
                    // messages.push(message);
                } catch (parseError) {
                    console.error('Error parsing line as JSON:', parseError);
                    console.error('Invalid line:', line);
                }
            }

            res.json(messages);
        });
    } else {
        res.json([]); 
    }
});


app.post('/register', (req, res) => {
    const { username, password, age, birthday, status, gender, downloadFolder, osType, homeDir, currentDir } = req.body;

    const ipAddress = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;

    fs.readFile('userinfo.txt', 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                data = '[]'; 
            } else {
                return res.status(500).send('Error reading userinfo.txt');
            }
        }

        let usersArray = [];
        console.log('Data read from file:', data); 

        if (data) {
            try {
                usersArray = JSON.parse(data);
            } catch (parseError) {
                console.error('Error parsing user data:', parseError);
                usersArray = [];
            }
        }

        const nextId = usersArray.length > 0 ? Math.max(...usersArray.map(user => user.id)) + 1 : 1;

        const userObject = {
            id: nextId,
            username,
            password, 
            age,
            birthday,
            status,
            gender,
            downloadFolder,
            osType,
            homeDir,
            currentDir,
            ipAddress, 
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null 
        };
        console.log(userObject, 'userObject');
        usersArray.push(userObject);
        fs.writeFile('userinfo.txt', JSON.stringify(usersArray, null, 2), (writeError) => {
            if (writeError) {
                return res.status(500).send('Error saving userinfo.txt');
            }
            res.sendStatus(200);
        });
    });
});



app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    fs.readFile('userinfo.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading user info:', err);
            return res.status(500).send('Error reading user info');
        }

        const users = data.split('\n').filter(Boolean);
        const user = users.find(user => {
            const [userName, userPassword] = user.split(':');
            return userName === username;
        });

        if (user) {
            const [userName, userPassword] = user.split(':');
            if (userPassword === password) {
                res.sendStatus(200); // Login successful
            } else {
                res.status(401).send('Invalid username or password');
            }
        } else {
            res.status(401).send('Invalid username or password');
        }
    });
});


app.get('/fetch-users-friends', (req, res) => {
    fs.readFile('userinfo.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading user info:', err);
            return res.status(500).send('Error reading user info');
        }

        let users = [];
        try {
            users = JSON.parse(data);
        } catch (parseError) {
            console.error('Error parsing user data:', parseError);
            return res.status(500).send('Error parsing user data');
        }

        const usernames = users.map(user => user.username);
        res.json(usernames);

       
    });
});


app.get('/fetch-users', (req, res) => {
    const { username, password } = req.query;

    fs.readFile('userinfo.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading user info:', err);
            return res.status(500).send('Error reading user info');
        }

        let users = [];
        try {
            users = JSON.parse(data); 
        } catch (parseError) {
            console.error('Error parsing user data:', parseError);
            return res.status(500).send('Error parsing user data');
        }
        const user = users.find(user => user.username === username && user.password === password);

        if (!user) {
            return res.json([]); 
        }
        res.json([user]); 
    });
});

// Endpoint to fetch friends list
app.get('/fetch-friends-list', (req, res) => {
    if (fs.existsSync('friendslist.txt')) {
        fs.readFile('friendslist.txt', 'utf8', (err, data) => {
            if (err) {
                return res.status(500).send('Error reading friends list');
            }
            res.send(data);
        });
    } else {
        res.send(''); // Return empty if file does not exist
    }
});

const PORT = process.env.PORT || 4512;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
