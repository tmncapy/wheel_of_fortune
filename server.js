const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// CẤU TRÚC LẠI TRẠNG THÁI NÓN ĐỂ ĐỒNG BỘ THEO MỐC THỜI GIAN THỰC TOÀN CỤC
let wheelState = {
  activeImage: 'wheel-template.png', 
  rotation: 0,
  velocity: 0,
  baseRotation: 0,
  initVelocity: 0,
  spinStartTime: 0,      
  isDraggingSync: false,
  currentPlayerTurn: null // null nghĩa là chưa ai được quyền quay, hoặc lưu 'p1', 'p2', 'p3'
};

io.on('connection', (socket) => {
  // 1. Khi có bất kỳ tab nào kết nối (hoặc reload), gửi ngay trạng thái thực tế gần nhất
  socket.emit('initGameState', wheelState);

  // 2. Lắng nghe sự kiện đổi mặt nón từ Tech
  socket.on('techChangeImage', (imageName) => {
    wheelState.activeImage = imageName;
    io.emit('playerUpdateImage', imageName);
  });

  // 3. Lắng nghe sự kiện cấp quyền quay cho từng người chơi từ Tech
  socket.on('techSelectPlayerTurn', (playerId) => {
    wheelState.currentPlayerTurn = playerId; // 'p1', 'p2', 'p3' hoặc null
    io.emit('serverUpdateTurn', playerId);
  });

  // 4. Lắng nghe sự kiện reset nón về góc 0 từ Tech
  socket.on('techResetWheel', () => {
    wheelState.rotation = 0;
    wheelState.velocity = 0;
    wheelState.baseRotation = 0;
    wheelState.initVelocity = 0;
    wheelState.spinStartTime = 0;
    wheelState.isDraggingSync = false;
    io.emit('playerSyncPhysics', { rotation: 0, velocity: 0 });
  });

  // 5. Lắng nghe dữ liệu dịch chuyển vật lý thời gian thực từ Player đang tương tác
  socket.on('playerMoveWheel', (data) => {
    if (data.spinStartTime) {
      wheelState.baseRotation = data.baseRotation;
      wheelState.initVelocity = data.initVelocity;
      wheelState.spinStartTime = data.spinStartTime;
      wheelState.velocity = data.initVelocity;
      wheelState.isDraggingSync = false;
    } else {
      wheelState.rotation = data.rotation;
      wheelState.velocity = data.velocity ?? 0;
      wheelState.spinStartTime = 0; 
      wheelState.isDraggingSync = data.isDraggingSync || false;
    }
    
    if (data.rotation !== undefined) {
      wheelState.rotation = data.rotation;
    }

    socket.broadcast.emit('playerSyncPhysics', data);
  });

  // 6. Cập nhật trạng thái tĩnh khi nón đã dừng hẳn
  socket.on('playerStopWheel', (data) => {
    wheelState.rotation = data.rotation;
    wheelState.velocity = 0;
    wheelState.baseRotation = 0;
    wheelState.initVelocity = 0;
    wheelState.spinStartTime = 0;
    wheelState.isDraggingSync = false;
    
    io.emit('playerSyncPhysics', { rotation: data.rotation, velocity: 0 });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy tại port: ${PORT}`);
});
