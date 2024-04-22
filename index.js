let app = require('express')()
let bodyParser = require('body-parser')
let mysql = require('mysql')
const { v4: uuidv4 } = require('uuid')
let moment = require('moment-timezone')
let http = require('http').Server(app)
let io = require('socket.io')(http)
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));


let connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'simple_chat'
});

connection.connect(function(err) {
    if (err) {
      return console.error('error: ' + err.message);
    }

    console.log('Connected to the MySQL server.');
  });

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
});

app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/admin.html')
});

app.get('/current-user', (req, res) => {
    let date = moment().tz('Asia/Yangon').format('YYYY-MM-DD')
    let sql = `SELECT * FROM chat_user WHERE created_at LIKE "%` + date +`%" ORDER BY id DESC` ;
    connection.query(sql, (err, result) => {
        let userList = [];
        result.forEach(user => {
            userList.push({"name": user.name, "room": user.room_id, "status": user.status, "date": user.created_at})
        });
        res.json(userList);
    });
});

app.post('/get-message', (req, res) => {
    let sql = `SELECT id FROM chat_user WHERE room_id = "` + req.body.id +`"`;
    connection.query(sql, (err, result) => {
        var string=JSON.stringify(result);
        var json =  JSON.parse(string);
        let message = `SELECT * FROM chat_message WHERE chat_user_id ="`+ json[0].id +`"`;
        connection.query(message, (err, result) => {
            res.json(result);
        });
    });
});

app.post('/user', (req, res) => {
    let name = req.body.name
    let id = uuidv4()
    var user  = {room_id: id, name: name, status: "new", created_at: moment().tz('Asia/Yangon').format('YYYY-MM-DD hh:mm:ss')};
    connection.query('INSERT INTO chat_user SET ?', user, function(err, result) {
        console.log(user)
        res.json(user);
    });
});

http.listen(3000, () => {
    console.log('Listening on port *: 3000');
});

io.on('connection', (socket) => {
    socket.emit('connections', Object.keys(io.sockets.connected).length);
    socket.on('disconnect', () => {
        console.log("A user disconnected");
    });

    socket.on("join-user", (data) => {
        socket.join("chat-user")
        socket.emit('chat-user', {"user": "admin", "room": "admin"});
    });

    socket.on("joinRoom", (data) => {
        socket.join(data.room)
        socket.join("chat-user")
        if(data.name){
            var uName = data.name
            socket.broadcast.to("chat-user").emit('user-list', {"name": uName, "room": data.room, "status": data.status, "date": moment().tz('Asia/Yangon').format('hh:mm a')});
        }else{
            var uName = "Admin"
            let message = `UPDATE chat_user SET status ="0" WHERE room_id ="`+ data.room +`"`;
            var userUpdate = connection.query(message, (err, result) => {
                socket.join("chat-user")
                socket.broadcast.to("chat-user").emit('user-list', {"name": data.name, "room": data.room, "status": 0, "date": moment(data.created_at).tz('Asia/Yangon').format('hh:mm a')});
            });
        }
        // socket.broadcast.to(data.room).emit('message', {"user": uName, "message": `${uName} has joined the chat`});
    });

    socket.on('chat-message', (data) => {
        let sql = `SELECT id, status, name FROM chat_user WHERE room_id = "` + data.id +`"`;
        connection.query(sql, (err, result) => {
            var string=JSON.stringify(result);
            var json =  JSON.parse(string);
            if (data.user == null) {
                type = "admin"
                let message = `UPDATE chat_user SET status ="0" WHERE id ="`+ json[0].id +`"`;
                var userUpdate = connection.query(message, (err, result) => {
                    socket.join("chat-user")
                    socket.broadcast.to("chat-user").emit('user-list', {"name": json[0].name, "room": data.id, "status": 0, "date": moment(data.created_at).tz('Asia/Yangon').format('hh:mm a')});
                });
            }else{
                type = "user"
                if(json[0].status == "new"){
                    var messageCount = parseInt(0)+1
                }else{
                    var messageCount = parseInt(json[0].status)+1
                }
                let message = `UPDATE chat_user SET status = "`+ messageCount +`" WHERE id ="`+ json[0].id +`"`;
                var userUpdate = connection.query(message, (err, result) => {
                    socket.broadcast.to("chat-user").emit('user-list', {"name": json[0].name, "room": data.id, "status": messageCount, "date": moment(data.created_at).tz('Asia/Yangon').format('hh:mm a')});
                });
            }
            var chat  = {chat_user_id: json[0].id, type: type, message: data.message, created_at: moment().tz('Asia/Yangon').format('YYYY-MM-DD hh:mm:ss')};
            connection.query('INSERT INTO chat_message SET ?', chat, function(err, result) {
                socket.broadcast.to(data.id).emit('message', {"user": data.user, "message": data.message});
            });
        });
    });

    socket.on('typing', (data) => {
        if(data.name){
            var uName = data.name
            socket.broadcast.to(data.room).emit('typing', data);
        }else{
            var uName = "Admin"
            socket.broadcast.to(data.room).emit('typing', uName);
        }
    });

    socket.on('stopTyping', (data) => {
        socket.broadcast.to(data.room).emit('stopTyping');
    });

    socket.on('leave', (data) => {
        if(data.name){
            var uName = data.name
        }else{
            var uName = "Admin"
        }
        // socket.broadcast.to(data.room).emit('message', {"user": uName, "message": `${uName} has left the chat`});
    });

});