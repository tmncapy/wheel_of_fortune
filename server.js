const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Cấu hình CORS cho phép kết nối từ mọi nguồn nếu cần tách biệt client/server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Phục vụ các file tĩnh (HTML, CSS, JS, Hình ảnh...) trong cùng thư mục
app.use(express.static(__dirname));

// Định tuyến mặc định gửi về trang đăng nhập người chơi
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Định tuyến cho trang điều khiển của kỹ thuật
app.get('/tech', (req, res) => {
  res.sendFile(path.join(__dirname, 'tech.html'));
});

/**
 * Cấu trúc dữ liệu lưu trữ các phòng trên bộ nhớ RAM (In-memory Server)
 * rooms: {
 * "123456": {
 * passwords: { "Player 1": "1111", "Player 2": "2222", "Player 3": "3333" },
 * allowedPlayer: null // Lưu trữ tên Player đang được quyền quay nón
 * }
 * }
 */
const rooms = {};

// Quản lý các kết nối Socket.io
io.on('connection', (socket) => {
  console.log(`[SOCKET] Người dùng mới kết nối. ID: ${socket.id}`);

  // --- 1. SỰ KIỆN TỪ TRANG TECH (CONTROLLER) ---

  // Kỹ thuật khởi tạo phòng hoặc cập nhật mật khẩu phòng
  socket.on('techCreateRoom', (data) => {
    if (!data || !data.roomid) return;

    const { roomid, passwords } = data;
    
    // Nếu phòng chưa tồn tại thì khởi tạo mới, giữ lại allowedPlayer cũ nếu có
    if (!rooms[roomid]) {
      rooms[roomid] = {
        passwords: passwords || { "Player 1": null, "Player 2": null, "Player 3": null },
        allowedPlayer: null
      };
    } else {
      // Nếu đã có phòng thì chỉ cập nhật lại cấu hình mật khẩu mới
      rooms[roomid].passwords = passwords;
    }

    // Kỹ thuật tự động tham gia vào "room" của Socket.io dựa trên roomid để quản lý broadcast
    socket.join(roomid);
    console.log(`[TECH] Khởi tạo/Đồng bộ thành công phòng: ${roomid}`, rooms[roomid]);
  });

  // Kỹ thuật cấp quyền quay nón cho người chơi
  socket.on('techSetAllowedPlayer', (data) => {
    if (!data || !data.roomid) return;
    const { roomid, player } = data;

    if (rooms[roomid]) {
      rooms[roomid].allowedPlayer = player;
      console.log(`[PERMISSION] Phòng ${roomid}: Cấp quyền quay cho [${player}]`);
      
      // Gửi tín hiệu cập nhật quyền tới tất cả các client trong phòng (bao gồm các máy Players)
      io.to(roomid).emit('serverUpdatePermission', { allowedPlayer: player });
    }
  });

  // Kỹ thuật thay đổi mặt nón thi đấu
  socket.on('techChangeImage', (data) => {
    if (!data || !data.roomid || !data.imageName) return;
    const { roomid, imageName } = data;

    console.log(`[WHEEL FACE] Phòng ${roomid}: Thay đổi mặt nón -> ${imageName}`);
    // Truyền lệnh thay đổi giao diện tới các máy Player thuộc phòng này
    io.to(roomid).emit('serverChangeWheelImage', { imageName: imageName });
  });

  // Kỹ thuật đưa nón về góc 0
  socket.on('techResetWheel', (data) => {
    if (!data || !data.roomid) return;
    const { roomid } = data;

    console.log(`[WHEEL RESET] Phòng ${roomid}: Reset nón về 0 độ`);
    // Truyền lệnh reset nón tới các máy Player thuộc phòng này
    io.to(roomid).emit('serverResetWheelZero');
  });

  // Kỹ thuật kích hoạt phát âm thanh Soundboard
  socket.on('techPlaySound', (data) => {
    if (!data || !data.roomid || !data.soundName) return;
    const { roomid, soundName } = data;

    console.log(`[SOUNDBOARD] Phòng ${roomid}: Phát âm thanh -> ${soundName}.mp3`);
    // Truyền lệnh phát nhạc tới các máy Player thuộc phòng này
    io.to(roomid).emit('serverPlaySound', { soundName: soundName });
  });


  // --- 2. SỰ KIỆN TỪ TRANG INDEX (XÁC THỰC NGƯỜI CHƠI) ---

  // Xử lý logic đăng nhập phòng của người chơi (Sử dụng Callback Ack)
  socket.on('playerVerifyLogin', (payload, callback) => {
    console.log('[LOGIN] Nhận yêu cầu xác thực đăng nhập:', payload);
    
    if (!payload || !payload.roomid || !payload.playerRole || !payload.password) {
      return callback({ success: false, message: 'Dữ liệu gửi lên không hợp lệ!' });
    }

    const { roomid, playerRole, password } = payload;
    const room = rooms[roomid];

    // Kiểm tra mã phòng tồn tại
    if (!room) {
      return callback({ success: false, message: 'Phòng thi đấu này không tồn tại hoặc chưa được Tech khởi tạo!' });
    }

    // Kiểm tra mật khẩu tương ứng với Role đã chọn
    const targetPassword = room.passwords[playerRole];
    if (targetPassword && targetPassword === password.toString()) {
      
      // Đăng nhập thành công -> Cho socket của người chơi này join vào phòng tương ứng
      socket.join(roomid);
      console.log(`[LOGIN SUCCESS] ${playerRole} đã đăng nhập thành công vào phòng ${roomid}`);
      
      return callback({ success: true, message: 'Xác thực thành công!' });
    } else {
      return callback({ success: false, message: 'Mật khẩu đăng nhập không chính xác!' });
    }
  });

  // Người chơi hoặc kỹ thuật kiểm tra danh sách phòng đang chạy trên server (Nút Kiểm Tra Server)
  socket.on('debugGetAllRooms', (callback) => {
    console.log('[DEBUG] Yêu cầu lấy thông tin tất cả các phòng từ Client');
    
    // Tạo bản sao cấu hình mật khẩu để phản hồi về Client hiển thị
    const debugData = {};
    for (let id in rooms) {
      debugData[id] = rooms[id].passwords;
    }
    
    callback(debugData);
  });

  // Xử lý khi ngắt kết nối
  socket.on('disconnect', () => {
    console.log(`[SOCKET] Người dùng ngắt kết nối. ID: ${socket.id}`);
  });
});

// Triển khai Server chạy trên cổng 3000 hoặc cổng được cấp phát bởi dịch vụ Hosting (Render, Heroku...)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SERVER CHẠY THÀNH CÔNG TẠI CỔNG: ${PORT}`);
  console.log(`🔗 Giao diện người chơi: http://localhost:${PORT}`);
  console.log(`🔗 Giao diện kỹ thuật:   http://localhost:${PORT}/tech`);
  console.log(`====================================================`);
});
