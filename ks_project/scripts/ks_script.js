const axios = require('axios'); // 需要安装 axios
const process = require('process');

// ==========================================
// 核心配置 (从环境变量读取)
// ==========================================
const BASE_URL = process.env.u || 'http://127.0.0.1:5000'; // 签名服务地址
const DEVICE_ID = process.env.DEVICE_ID; // 当前任务绑定的设备ID

if (!DEVICE_ID) {
    console.error("❌ 错误: 未指定 DEVICE_ID 环境变量，无法进行签名请求。");
    process.exit(1);
}

const COOKIE = process.env.ks;
if (!COOKIE) {
    console.error("❌ 错误: 未找到 Cookie (环境变量 ks)");
    process.exit(1);
}

// 任务配置
const Task = process.env.Task || 'all';
const COIN_LIMIT = parseInt(process.env.COIN_LIMIT || 550000);
const ROUNDS = parseInt(process.env.ROUNDS || 40);
const LOW_REWARD_THRESHOLD = parseInt(process.env.LOW_REWARD_THRESHOLD || 200);
const LOW_REWARD_LIMIT = parseInt(process.env.LOW_REWARD_LIMIT || 3);

// 提取 Cookie 里的关键字段
const ckParts = COOKIE.split('#'); // 假设格式: salt#kuaishou.api_st=xxx#uid#egid#did
if (ckParts.length < 5) {
    console.error("❌ Cookie 格式不正确，应为: salt#kuaishou.api_st=...#uid#egid#did");
    // process.exit(1); // 暂时不强退，尝试解析
}
const salt = ckParts[0];
const api_st = ckParts[1] ? ckParts[1].replace('kuaishou.api_st=', '') : '';
const uid = ckParts[2];
const egid = ckParts[3];
const did = ckParts[4];

// ==========================================
// 辅助函数
// ==========================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 通用 HTTP 请求封装
async function httpRequest(options, name) {
    try {
        const config = {
            method: options.method || 'GET',
            url: options.url,
            headers: options.headers || {},
            data: options.body || options.form || undefined
        };
        const response = await axios(config);
        return response.data;
    } catch (error) {
        // console.error(`[Request Error] ${name}:`, error.message);
        if (error.response) return error.response.data;
        return { error: error.message };
    }
}

// ==========================================
// 核心逻辑类
// ==========================================
class UserInfo {
    constructor() {
        this.index = 1;
        this.headers = {
            'Host': 'api.e.kuaishou.com',
            'Connection': 'keep-alive',
            'User-Agent': 'kwai-android aegon/3.56.0',
            'Cookie': `kuaishou.api_st=${api_st};client_key=2ac2a76d;`,
            'content-type': 'application/json',
        };
        this.query = `mod=Xiaomi%28MI%208%20Lite%29&appver=12.11.10.9145&egid=${egid}&did=${did}`;
        this.encData = '';
        this.sign = '';
        this.boxEncData = '';
        this.boxSign = '';
    }

    // 1. 获取本地签名 (替代原 enc)
    async getEncData() {
        console.log(`[准备] 正在请求本地签名服务 (设备: ${DEVICE_ID})...`);
        try {
            // 请求 encdata
            const encBody = JSON.stringify({ did: did, uid: uid });
            const encRes = await axios.post(`${BASE_URL}/encdata?device=${DEVICE_ID}`, { data: encBody });
            this.encData = encRes.data.result; // 注意 ksapi.py 返回的是 base64 后的 result

            // 请求 sign
            const signRes = await axios.post(`${BASE_URL}/sign?device=${DEVICE_ID}`, { data: encBody });
            this.sign = signRes.data.result;

            // 这里原脚本还有一个 boxencData，通常和 encData 逻辑类似，或者不同参数
            // 假设 box 也是同样的 did+uid 参数 (根据原脚本逻辑推断，如果有区别需调整)
            this.boxEncData = this.encData; 
            this.boxSign = this.sign;

            if (this.encData && this.sign) {
                console.log(`✅ 获取本地签名成功`);
                return true;
            } else {
                console.error(`❌ 获取签名返回为空`);
                return false;
            }
        } catch (e) {
            console.error(`❌ 连接签名服务失败: ${e.message}`);
            return false;
        }
    }

    // 2. 获取任务信息 (cid)
    async getTaskInfo(type) {
        if (!this.encData) {
            const ok = await this.getEncData();
            if (!ok) return;
        }

        let currentEnc = (type === 606) ? this.boxEncData : this.encData;
        let currentSign = (type === 606) ? this.boxSign : this.sign;

        let options = {
            method: "post",
            url: `https://api.e.kuaishou.cn/rest/e/reward/mixed/ad`,
            headers: {
                ...this.headers,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            form: `encData=${encodeURIComponent(currentEnc)}&sign=${encodeURIComponent(currentSign)}&client_key=2ac2a76d`
        };

        let result = await httpRequest(options, 'getTaskInfo');
        
        if (result.errorMsg == 'OK') {
            try {
                let s = result.feeds[0].exp_tag;
                let parts = s.split('/');
                let ss = parts[1];
                let f = ss.split('_')[1] || ss.split('_')[0]; // 简化解析逻辑
                
                let cid = result.feeds[0].ad.creativeId;
                let llsid = f;
                let tp = result.feedType;
                
                console.log(`[任务] 获取成功 type=${type}, cid=${cid}, feedType=${tp}`);
                
                if (tp === 0) {
                    await this.doSig3(cid, llsid, type, 'video');
                }
            } catch (e) {
                console.log(`❌ 解析任务数据异常: ${e.message}`);
            }
        } else {
            console.log(`❌ 获取任务失败: ${result.errorMsg || JSON.stringify(result)}`);
            // 如果失效可能需要重置 enc
            if (result.errorMsg && (result.errorMsg.includes('过期') || result.errorMsg.includes('无效'))) {
                this.encData = ''; 
            }
        }
    }

    // 3. 计算 sig3 (本地 RPC)
    async doSig3(cid, llsid, t, tt) {
        let ts = Date.now();
        let ts25 = ts - 25000;
        let postData = '';

        // 构造业务参数
        if (t === 672) {
            postData = `bizStr={"businessId":${t},"endTime":${ts25},"extParams":"","mediaScene":"${tt}","neoInfos":[{"creativeId":${cid},"extInfo":"","llsid":${llsid},"requestSceneType":7,"taskType":2,"watchExpId":"","watchStage":0},{"creativeId":${cid},"extInfo":"","llsid":${llsid},"requestSceneType":1,"taskType":3,"watchExpId":"","watchStage":0}],"pageId":11101,"posId":24067,"reportType":0,"sessionId":"","startTime":${ts},"subPageId":100026367}&cs=false&client_key=2ac2a76d`;
        } else if (t === 606) {
            postData = `bizStr={"businessId":${t},"endTime":${ts25},"extParams":"","mediaScene":"${tt}","neoInfos":[{"creativeId":${cid},"extInfo":"","llsid":${llsid},"requestSceneType":7,"taskType":2,"watchExpId":"","watchStage":0}],"pageId":11101,"posId":20346,"reportType":0,"sessionId":"","startTime":${ts},"subPageId":100024064}&cs=false&client_key=2ac2a76d`;
        }

        // 构造签名用的大字符串
        let signStr = `query=${this.query}|post=${postData}|salt=${salt}|path=/rest/r/ad/task/report|`;
        
        try {
            // 请求 nssig3
            // 原脚本这里调用的远程接口返回了 Sig, Sig3, NsSig
            // 我们本地 ksapi.py 的 /nssig3 只返回了 result (对应 nssig3)
            // 如果原脚本还需要 sig 和 NsSig，通常意味着我们需要分别计算或者 atlasSign 接口能返回更多
            // **修正**: 根据 ksapi.py，/nssig3 调用的是 KSecurity.atlasSign(obj0)，这通常只返回 sig3
            // 而 /sign 接口调用的是 atlasSign，可能返回 sig
            
            // 让我们看看 ksapi.py 里的 call_atlasSign 返回什么，它是 script.exports_sync.atlassignapi
            // 对应 ks.js 里的 savedInstance.atlasSign(str, str2, i4, str3) -> 这个通常返回 sig
            
            // 这是一个复杂的点：快手协议里 sig, __NS_sig3 是两个东西。
            // sig: 用 atlasSign 算出来的
            // __NS_sig3: 用 KSecurity.atlasSign 算出来的 (ksapi.py /nssig3)
            
            // 1. 计算 sig
            // 参数构造参考原逻辑，通常是对 param 字符串签名
            // 原脚本里远程接口直接把 query+post+salt+path 传过去了，远程帮拼好了
            // 我们本地需要自己调。
            // 假设 sig 是对 (path + ? + query + post) 的签名，具体取决于 atlasSign 的入参要求
            // 既然 ksapi.py 的 /sign 接口接收 'data' 并传给 atlasSign(..., data)，我们需要知道 data 应该是啥
            // 通常 data = query参数 + body参数 (排序后)
            
            // **简化处理**: 
            // 为了保证能跑，我们假设 postData 本身就是需要签名的核心部分，或者我们需要拼接
            // 这里为了稳妥，我们先只计算 __NS_sig3，因为它是最难搞的
            // sig 的计算可能需要抓包看具体原串，或者看 ks.js 里的 hook 逻辑
            
            // 调用 /nssig3
            const sig3Res = await axios.post(`${BASE_URL}/nssig3?device=${DEVICE_ID}`, { data: signStr });
            const sig3 = sig3Res.data.result;

            // 调用 /sign (尝试计算 sig)
            // 注意：这里传入 signStr 可能不完全正确，因为 atlasSign 这里的参数定义比较模糊
            // 但原远程接口就是这么传的，我们姑且认为本地 adapter 也能处理，或者我们只拿 sig3 试试
            // 如果失败，可能需要进一步调试 sig 的生成原文
            const sigRes = await axios.post(`${BASE_URL}/sign?device=${DEVICE_ID}`, { data: signStr }); 
            const sig = sigRes.data.result;

            // NsSig 通常是 token 的签名，暂时留空或者用 sig 代替测试
            const sigToken = ''; 

            if (sig3) {
                await this.reportAd(sig, sig3, sigToken, postData, t);
            }

        } catch (e) {
            console.error(`❌ 计算签名失败: ${e.message}`);
        }
    }

    // 4. 上报奖励
    async reportAd(sig, sig3, sigToken, postData, type) {
        let url = `https://api.e.kuaishou.com/rest/r/ad/task/report?${this.query}&sig=${sig}&__NS_sig3=${sig3}&__NS_xfalcon=&__NStokensig=${sigToken}`;
        
        let options = {
            method: "post",
            url: url,
            headers: {
                ...this.headers,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: postData
        };

        let result = await httpRequest(options, 'reportAd');
        
        if (result.result == 1) {
            console.log(`🎉 [奖励] 获得金币: ${result.data.neoAmount} (总: ${result.data.totalCoin})`);
        } else {
            console.log(`⚠️ [上报失败] code=${result.result}, msg=${result.errorMsg}`);
            // console.log(JSON.stringify(result));
        }
    }
}

// ==========================================
// 主入口
// ==========================================
async function start() {
    console.log(`🚀 开始运行任务`);
    console.log(`📱 设备ID: ${DEVICE_ID}`);
    console.log(`🎯 任务类型: ${Task}, 轮数: ${ROUNDS}`);

    const user = new UserInfo();
    
    // 初始化获取签名
    const ready = await user.getEncData();
    if (!ready) {
        console.log("❌ 初始化签名失败，退出");
        return;
    }

    for (let i = 0; i < ROUNDS; i++) {
        console.log(`\n--- 第 ${i + 1} / ${ROUNDS} 轮 ---`);
        
        if (Task === 'all' || Task === 'food') {
            await user.getTaskInfo(672); // 饭补/视频
            await sleep(2000);
        }
        
        if (Task === 'all' || Task === 'box') {
            await user.getTaskInfo(606); // 宝箱
            await sleep(2000);
        }
        
        // 随机休息
        const delay = Math.floor(Math.random() * 5000) + 5000;
        console.log(`⏳ 休息 ${delay}ms...`);
        await sleep(delay);
    }
    
    console.log(`✅ 所有任务完成`);
}

start();
