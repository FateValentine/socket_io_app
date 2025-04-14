import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import chokidar from 'chokidar';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {}); // Pass an empty object for default options

// Serve static files from the public directory
app.use(express.static('public'));
app.use(express.json()); // Middleware to parse JSON request bodies

const messagesFilePath = 'messages.txt';

interface Message {
    from?: string;
    message?: string;
    to?: string;
    dateCreated?: string;
    id?: string;
    emoji?: string;
    dateUpdated?: string;
}

const readMessagesFromFile = (): Message[] => {
    if (fs.existsSync(messagesFilePath)) {
        const data = fs.readFileSync(messagesFilePath, 'utf8');
        const lines = data.split('\n').filter(line => line.trim() !== '');
        return lines.map(line => JSON.parse(line) as Message);
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

    socket.on('chat message', ({ msg, user, to }: { msg: string; user: string; to: string }) => {
        console.log('Message received: ' + msg);

        const messageObject: Message = {
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
        io.emit('chat message', messageObject); // Emit the message object
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected');
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
            const messages: Message[] = [];

            // Parse each line as JSON
            for (const line of lines) {
                try {
                    const message = JSON.parse(line) as Message;
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

// New route to update a message
interface UpdateMessageBody {
    id?: string;
    newMessage?: string;
    newEmoji?: string;
}

app.put('/update-message', (req, res) => {
    const { id, newMessage, newEmoji } = req.body as UpdateMessageBody; // Expecting an ID, new message text, and new emoji
    const dateUpdated = new Date().toISOString(); // Use ISO format for consistency

    if (!id) {
        return res.status(400).send('Message ID is required');
    }

    // Read existing messages from the file
    fs.readFile('messages.txt', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error reading messages');
        }

        // Parse the existing messages
        const messages = data.split('\n').filter(line => line).map(line => JSON.parse(line) as Message);

        // Find the index of the message to update by ID
        const messageIndex = messages.findIndex(msg => msg.id === id); // Assuming each message has a unique ID

        if (messageIndex !== -1) {
            // Update the message text and emoji
            if (newMessage !== undefined) {
                messages[messageIndex].message = newMessage; // Update the message text
            }
            if (newEmoji !== undefined) {
                messages[messageIndex].emoji = newEmoji; // Update the emoji
            }
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

interface User {
    id: number;
    username?: string;
    password?: string;
    age?: number;
    birthday?: string;
    status?: string;
    gender?: string;
    downloadFolder?: string;
    osType?: string;
    homeDir?: string;
    currentDir?: string;
    ipAddress?: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string | null;
}

interface RegisterRequestBody {
    username?: string;
    password?: string;
    age?: number;
    birthday?: string;
    status?: string;
    gender?: string;
    downloadFolder?: string;
    osType?: string;
    homeDir?: string;
    currentDir?: string;
}

app.post('/register', (req, res) => {
    const { username, password, age, birthday, status, gender, downloadFolder, osType, homeDir, currentDir } = req.body as RegisterRequestBody;

    const ipAddress = req.headers['x-forwarded-for'] ? (req.headers['x-forwarded-for'] as string).split(',')[0].trim() : req.socket.remoteAddress;

    fs.readFile('userinfo.txt', 'utf8', (err, data) => {
        let usersArray: User[] = [];
        if (err) {
            if (err.code === 'ENOENT') {
                // File doesn't exist, start with an empty array
            } else {
                return res.status(500).send('Error reading userinfo.txt');
            }
        } else if (data) {
            try {
                usersArray = JSON.parse(data) as User[];
            } catch (parseError) {
                console.error('Error parsing user data:', parseError);
                return res.status(500).send('Error parsing user data');
            }
        }

        const nextId = usersArray.length > 0 ? Math.max(...usersArray.map(user => user.id)) + 1 : 1;

        const userObject: User = {
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

interface LoginRequestBody {
    username?: string;
    password?: string;
}

app.post('/login', (req, res) => {
    const { username, password } = req.body as LoginRequestBody;

    fs.readFile('userinfo.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading user info:', err);
            return res.status(500).send('Error reading user info');
        }

        let users: User[] = [];
        try {
            users = JSON.parse(data) as User[];
        } catch (parseError) {
            console.error('Error parsing user data:', parseError);
            return res.status(500).send('Error parsing user data');
        }

        const user = users.find(u => u.username === username && u.password === password);

        if (user) {
            res.json([user]); // Return the user object upon successful login
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

        let users: User[] = [];
        try {
            users = JSON.parse(data) as User[];
        } catch (parseError) {
            console.error('Error parsing user data:', parseError);
            return res.status(500).send('Error parsing user data');
        }

        const usernames = users.map(user => user.username).filter(Boolean) as string[];
        res.json(usernames);
    });
});

interface FetchUsersQuery {
    username?: string;
    password?: string;
}

app.get('/fetch-users', (req, res) => {
    const { username, password } = req.query as FetchUsersQuery;

    fs.readFile('userinfo.txt', 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading user info:', err);
            return res.status(500).send('Error reading user info');
        }

        let users: User[] = [];
        try {
            users = JSON.parse(data) as User[];
        } catch (parseError) {
            console.error('Error parsing user data:', parseError);
            return res.status(500).send('Error parsing user data');
        }

        const user = users.find(u => u.username === username && u.password === password);

        if (!user) {
            return res.json([]);
        }
        res.json([user]);
    });
});

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});