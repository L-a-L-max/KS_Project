const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

const CONFIG_FILE = path.join(__dirname, 'config', 'config.json');

// 确保配置目录存在
if (!fs.existsSync(path.dirname(CONFIG_FILE))) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
}

// 确保配置文件存在
if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({
        accounts: [],
        common: {
            Task: "all",
            COIN_LIMIT: 550000,
            ROUNDS: 40,
            LOW_REWARD_THRESHOLD: 200,
            LOW_REWARD_LIMIT: 3
        }
    }, null, 2));
}

// 获取配置
app.get('/api/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        res.json(config);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 保存配置
app.post('/api/config', (req, res) => {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 获取设备列表 (调用 adb)
app.get('/api/devices', (req, res) => {
    const adb = spawn('adb', ['devices']);
    let output = '';
    adb.stdout.on('data', (data) => output += data.toString());
    adb.on('close', () => {
        const lines = output.split('\n').filter(line => line.trim() !== '');
        // 第一行是 List of devices attached，去掉
        const devices = lines.slice(1)
            .filter(line => line.includes('\tdevice'))
            .map(line => line.split('\t')[0]);
        res.json(devices);
    });
});

let runningProcesses = {};

// 启动任务
app.post('/api/run', (req, res) => {
    const { accountIndex, deviceId } = req.body;
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const account = config.accounts[accountIndex];
    
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (runningProcesses[accountIndex]) return res.status(400).json({ error: 'Task already running' });

    // 构造环境变量
    const env = {
        ...process.env,
        // 脚本需要的变量
        ks: account.cookie,
        u: `http://127.0.0.1:5000`, // 指向本地签名服务
        cid: account.cid || '',
        sid: account.sid || '',
        phid: account.phid || '',
        Task: config.common.Task,
        COIN_LIMIT: String(config.common.COIN_LIMIT),
        ROUNDS: String(config.common.ROUNDS),
        LOW_REWARD_THRESHOLD: String(config.common.LOW_REWARD_THRESHOLD),
        LOW_REWARD_LIMIT: String(config.common.LOW_REWARD_LIMIT),
        
        // 传递给脚本识别设备ID，脚本请求签名时带上
        DEVICE_ID: deviceId
    };

    const scriptPath = path.join(__dirname, 'scripts', 'ks_script.js');
    const child = spawn('node', [scriptPath], { env });

    runningProcesses[accountIndex] = child;

    // 简单的日志处理，实际可以推送到前端
    child.stdout.on('data', (data) => {
        console.log(`[Account ${accountIndex}] ${data}`);
    });

    child.stderr.on('data', (data) => {
        console.error(`[Account ${accountIndex} ERROR] ${data}`);
    });

    child.on('close', (code) => {
        console.log(`[Account ${accountIndex}] Exited with code ${code}`);
        delete runningProcesses[accountIndex];
    });

    res.json({ success: true, pid: child.pid });
});

// 停止任务
app.post('/api/stop', (req, res) => {
    const { accountIndex } = req.body;
    const child = runningProcesses[accountIndex];
    if (child) {
        child.kill();
        delete runningProcesses[accountIndex];
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Task not running' });
    }
});

// 获取运行状态
app.get('/api/status', (req, res) => {
    const status = {};
    Object.keys(runningProcesses).forEach(idx => {
        status[idx] = true;
    });
    res.json(status);
});

app.listen(port, () => {
    console.log(`Web console running at http://localhost:${port}`);
});
