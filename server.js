const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

let rooms = {};

io.on('connection', (socket) => {
    socket.on('join-game', (roomId) => {
        if (!rooms[roomId]) rooms[roomId] = [];
        if (rooms[roomId].length < 2) {
            socket.join(roomId);
            rooms[roomId].push(socket.id);
            console.log(`Игрок ${socket.id} зашел в ${roomId}`);
        }

        if (rooms[roomId].length === 2) {
            io.to(roomId).emit('start-game', { players: rooms[roomId] });
        }
    });

    socket.on('move', (data) => {
        socket.to(data.room).emit('p2-move', data);
    });

    socket.on('next-level', (data) => {
        io.to(data.room).emit('load-level', data.level);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Сервер запущен на порту ' + PORT));