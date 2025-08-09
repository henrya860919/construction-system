#!/usr/bin/env node

/**
 * Socket.IO + RTMP 雲端服務器
 */

const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const NodeMediaServer = require('node-media-server');

class EnhancedCloudServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.gateways = new Map();
        this.rtmpStreams = new Map(); // 追蹤RTMP串流
        
        this.setupRTMPServer();
        this.setupRoutes();
        this.setupSocketHandlers();
    }

    setupRTMPServer() {
        const config = {
            rtmp: {
                port: 1935,
                chunk_size: 60000,
                gop_cache: true,
                ping: 30,
                ping_timeout: 60
            },
            http: {
                port: 8888,
                allow_origin: '*'
            }
        };

        this.rtmpServer = new NodeMediaServer(config);
        
        this.rtmpServer.on('preConnect', (id, args) => {
            console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
        });

        this.rtmpServer.on('postConnect', (id, args) => {
            console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
        });

        this.rtmpServer.on('doneConnect', (id, args) => {
            console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
        });

        this.rtmpServer.on('prePublish', (id, StreamPath, args) => {
            console.log('📡 RTMP 推流開始:', `StreamPath=${StreamPath}`);
            
            // 解析stream key，通常是設備ID
            const streamKey = StreamPath.split('/').pop();
            this.rtmpStreams.set(streamKey, {
                id: id,
                streamPath: StreamPath,
                startTime: new Date(),
                active: true
            });

            // 通知所有連線的客戶端有新串流
            this.io.emit('stream-started', {
                streamKey: streamKey,
                streamPath: StreamPath,
                timestamp: Date.now()
            });
        });

        this.rtmpServer.on('donePublish', (id, StreamPath, args) => {
            console.log('📡 RTMP 推流結束:', `StreamPath=${StreamPath}`);
            
            const streamKey = StreamPath.split('/').pop();
            this.rtmpStreams.delete(streamKey);

            // 通知串流結束
            this.io.emit('stream-ended', {
                streamKey: streamKey,
                timestamp: Date.now()
            });
        });
    }

    setupRoutes() {
        this.app.use(express.json());
        this.app.use(express.static('public'));
        
        // 健康檢查
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                service: 'Enhanced Cloud Server with RTMP',
                gateways: this.gateways.size,
                activeStreams: this.rtmpStreams.size,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });

        // RTMP串流清單API
        this.app.get('/api/streams', (req, res) => {
            const streams = Array.from(this.rtmpStreams.entries()).map(([key, value]) => ({
                streamKey: key,
                streamPath: value.streamPath,
                startTime: value.startTime,
                active: value.active
            }));
            res.json({ streams });
        });

        // 控制面板
        this.app.get('/', (req, res) => {
            const gatewayList = Array.from(this.gateways.values())
                .map(g => `<li><strong>${g.siteName}</strong> - ${g.connectedAt.toLocaleString()} (${g.deviceCount} 設備)</li>`)
                .join('');

            const streamList = Array.from(this.rtmpStreams.entries())
                .map(([key, value]) => `<li><strong>${key}</strong> - ${value.startTime.toLocaleString()}</li>`)
                .join('');

            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>工地監控雲端控制面板</title>
                    <style>
                        body { font-family: Arial; margin: 40px; background: #f5f5f5; }
                        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        h1 { color: #2c3e50; margin-bottom: 30px; }
                        h3 { color: #34495e; margin-top: 30px; }
                        button { padding: 12px 24px; margin: 10px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; }
                        button:hover { background: #2980b9; }
                        .stream-btn { background: #e74c3c; }
                        .stream-btn:hover { background: #c0392b; }
                        #log { border: 1px solid #ddd; padding: 15px; height: 400px; overflow-y: auto; margin: 20px 0; background: #fafafa; border-radius: 5px; font-family: monospace; }
                        .status { padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #27ae60; background: #d5f4e6; }
                        .send { color: #3498db; }
                        .receive { color: #27ae60; }
                        .error { color: #e74c3c; }
                        .stream { color: #e67e22; }
                        ul { background: #ecf0f1; padding: 15px; border-radius: 5px; }
                        .stats { display: flex; gap: 20px; margin: 20px 0; }
                        .stat-box { background: #3498db; color: white; padding: 20px; border-radius: 10px; flex: 1; text-align: center; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🌐 工地監控雲端控制面板</h1>
                        
                        <div class="stats">
                            <div class="stat-box">
                                <h3>📡 連線閘道器</h3>
                                <span id="gateway-count" style="font-size: 24px;">${this.gateways.size}</span>
                            </div>
                            <div class="stat-box" style="background: #e74c3c;">
                                <h3>📺 即時串流</h3>
                                <span id="stream-count" style="font-size: 24px;">${this.rtmpStreams.size}</span>
                            </div>
                            <div class="stat-box" style="background: #27ae60;">
                                <h3>⏰ 運行時間</h3>
                                <span style="font-size: 18px;">${Math.floor(process.uptime() / 60)} 分鐘</span>
                            </div>
                        </div>
                        
                        <div class="status">
                            <strong>✅ 系統狀態：</strong> 正常運行<br>
                            <strong>🕐 啟動時間：</strong> ${new Date().toLocaleString()}<br>
                            <strong>💻 Node.js版本：</strong> ${process.version}<br>
                            <strong>📡 RTMP服務：</strong> Port 1935 運行中
                        </div>
                        
                        <h3>📍 連線的工地：</h3>
                        <ul id="gateway-list">${gatewayList || '<li>目前沒有工地連線</li>'}</ul>
                        
                        <h3>📺 即時串流：</h3>
                        <ul id="stream-list">${streamList || '<li>目前沒有活躍串流</li>'}</ul>
                        
                        <div>
                            <button onclick="sendTestMessage()">📤 發送測試訊息</button>
                            <button onclick="requestDeviceList()">📋 查詢設備清單</button>
                            <button onclick="sendControlCommand()">🎮 發送控制指令</button>
                            <button onclick="requestStreamStart()">📺 要求開始串流</button>
                            <button onclick="requestStreamStop()" class="stream-btn">⏹️ 停止所有串流</button>
                            <button onclick="clearLog()">🗑️ 清除日誌</button>
                        </div>
                        
                        <h3>📊 即時日誌：</h3>
                        <div id="log"></div>
                    </div>

                    <script src="/socket.io/socket.io.js"></script>
                    <script>
                        const socket = io();
                        const log = document.getElementById('log');

                        function addLog(message, type = 'info') {
                            const time = new Date().toLocaleTimeString();
                            const color = type === 'send' ? 'send' : 
                                         type === 'receive' ? 'receive' : 
                                         type === 'error' ? 'error' :
                                         type === 'stream' ? 'stream' : '';
                            log.innerHTML += '<div class="' + color + '">[' + time + '] ' + message + '</div>';
                            log.scrollTop = log.scrollHeight;
                        }

                        // 監聽閘道器事件
                        socket.on('gateway-connected', (data) => {
                            addLog('🟢 工地上線: ' + data.siteName + ' (' + data.deviceCount + ' 設備)', 'receive');
                            updateStats();
                        });

                        socket.on('gateway-disconnected', (data) => {
                            addLog('🔴 工地離線: ' + data.siteName, 'error');
                            updateStats();
                        });

                        socket.on('gateway-response', (data) => {
                            addLog('📥 ' + data.siteName + ' 回應: ' + data.message, 'receive');
                        });

                        // 監聽串流事件
                        socket.on('stream-started', (data) => {
                            addLog('📺 串流開始: ' + data.streamKey, 'stream');
                            updateStats();
                        });

                        socket.on('stream-ended', (data) => {
                            addLog('⏹️ 串流結束: ' + data.streamKey, 'stream');
                            updateStats();
                        });

                        function sendTestMessage() {
                            const message = 'Hello from Cloud: ' + new Date().toLocaleTimeString();
                            socket.emit('cloud-message', { message: message });
                            addLog('📤 發送測試訊息: ' + message, 'send');
                        }

                        function requestDeviceList() {
                            socket.emit('request-devices', {});
                            addLog('📤 查詢所有工地設備清單', 'send');
                        }

                        function sendControlCommand() {
                            const command = 'CONTROL_' + Math.floor(Math.random() * 100);
                            socket.emit('device-control', { command: command });
                            addLog('📤 發送控制指令: ' + command, 'send');
                        }

                        function requestStreamStart() {
                            socket.emit('stream-control', { action: 'start' });
                            addLog('📤 要求開始所有攝影機串流', 'send');
                        }

                        function requestStreamStop() {
                            socket.emit('stream-control', { action: 'stop' });
                            addLog('📤 要求停止所有串流', 'send');
                        }

                        function clearLog() {
                            log.innerHTML = '';
                        }

                        function updateStats() {
                            fetch('/api/gateways')
                                .then(r => r.json())
                                .then(data => {
                                    document.getElementById('gateway-count').textContent = data.count;
                                    const list = data.gateways.map(g => 
                                        '<li><strong>' + g.siteName + '</strong> - ' + new Date(g.connectedAt).toLocaleString() + ' (' + g.deviceCount + ' 設備)</li>'
                                    ).join('');
                                    document.getElementById('gateway-list').innerHTML = list || '<li>目前沒有工地連線</li>';
                                })
                                .catch(() => {});

                            fetch('/api/streams')
                                .then(r => r.json())
                                .then(data => {
                                    document.getElementById('stream-count').textContent = data.streams.length;
                                    const streamList = data.streams.map(s => 
                                        '<li><strong>' + s.streamKey + '</strong> - ' + new Date(s.startTime).toLocaleString() + '</li>'
                                    ).join('');
                                    document.getElementById('stream-list').innerHTML = streamList || '<li>目前沒有活躍串流</li>';
                                })
                                .catch(() => {});
                        }

                        // 定期更新統計
                        setInterval(updateStats, 5000);
                    </script>
                </body>
                </html>
            `);
        });

        // API：取得閘道器清單
        this.app.get('/api/gateways', (req, res) => {
            const gateways = Array.from(this.gateways.values()).map(g => ({
                siteName: g.siteName,
                connectedAt: g.connectedAt,
                deviceCount: g.deviceCount || 0
            }));
            res.json({ 
                count: gateways.length, 
                gateways: gateways 
            });
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 新連線: ${socket.id}`);
            
            // 閘道器註冊
            socket.on('register-gateway', (data) => {
                this.gateways.set(socket.id, {
                    id: socket.id,
                    siteName: data.siteName || '未命名工地',
                    connectedAt: new Date(),
                    socket: socket,
                    deviceCount: data.deviceCount || 0,
                    lastHeartbeat: Date.now()
                });
                
                console.log(`✅ 閘道器註冊: ${data.siteName}`);
                
                // 通知所有客戶端有新工地上線
                this.io.emit('gateway-connected', {
                    siteName: data.siteName,
                    deviceCount: data.deviceCount || 0
                });
            });

            // 接收閘道器回應
            socket.on('gateway-response', (data) => {
                console.log(`📥 收到回應 [${data.siteName}]:`, data.message);
                this.io.emit('gateway-response', data);
            });

            // 雲端發送訊息給所有閘道器
            socket.on('cloud-message', (data) => {
                console.log(`📤 雲端廣播:`, data.message);
                this.broadcastToGateways('cloud-message', data);
            });

            // 查詢設備清單
            socket.on('request-devices', (data) => {
                console.log(`📋 查詢設備清單`);
                this.broadcastToGateways('request-devices', data);
            });

            // 設備控制指令
            socket.on('device-control', (data) => {
                console.log(`🎮 設備控制:`, data.command);
                this.broadcastToGateways('device-control', data);
            });

            // 串流控制
            socket.on('stream-control', (data) => {
                console.log(`📺 串流控制:`, data.action);
                this.broadcastToGateways('stream-control', data);
            });

            // 心跳
            socket.on('heartbeat', (data) => {
                if (this.gateways.has(socket.id)) {
                    const gateway = this.gateways.get(socket.id);
                    gateway.lastHeartbeat = Date.now();
                    if (data.deviceCount !== undefined) {
                        gateway.deviceCount = data.deviceCount;
                    }
                }
            });

            // 斷線處理
            socket.on('disconnect', () => {
                const gateway = this.gateways.get(socket.id);
                if (gateway) {
                    console.log(`❌ 閘道器斷線: ${gateway.siteName}`);
                    this.io.emit('gateway-disconnected', {
                        siteName: gateway.siteName
                    });
                    this.gateways.delete(socket.id);
                }
            });
        });
    }

    // 廣播給所有閘道器
    broadcastToGateways(event, data) {
        let count = 0;
        this.gateways.forEach((gateway) => {
            gateway.socket.emit(event, {
                ...data,
                timestamp: Date.now(),
                fromCloud: true
            });
            count++;
        });
        console.log(`📡 廣播 ${event} 給 ${count} 個閘道器`);
    }

    start() {
        const port = process.env.PORT || 3000;
        
        // 啟動RTMP服務器
        this.rtmpServer.run();
        console.log('📺 RTMP 服務器啟動: Port 1935');
        
        // 啟動HTTP服務器
        this.server.listen(port, () => {
            console.log('🌐 Socket.IO 雲端服務器啟動');
            console.log(`📊 控制面板: http://localhost:${port}`);
            console.log(`🔧 健康檢查: http://localhost:${port}/health`);
            console.log(`📡 等待工地閘道器連線...`);
            console.log(`📺 RTMP推流地址: rtmp://localhost:1935/live/[streamKey]`);
        });
    }
}

// 啟動服務器
const server = new EnhancedCloudServer();
server.start();