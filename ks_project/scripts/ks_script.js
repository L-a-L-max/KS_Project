const axios = require('axios');
const crypto = require('crypto');
const process = require('process');

const BASE_URL = process.env.u || 'http://127.0.0.1:5000';
const DEVICE_ID = process.env.DEVICE_ID;

if (!DEVICE_ID) {
    console.error("错误: 未指定 DEVICE_ID 环境变量");
    process.exit(1);
}

var FANS_SALT = '772867c19925';

var api_st = process.env.KS_API_ST || '';
var uid = process.env.KS_UID || '';
var egid = process.env.KS_EGID || '';
var did = process.env.KS_DID || '';
var salt = FANS_SALT;

if (!api_st || !uid || !did) {
    console.error('错误: 缺少必要参数 (KS_API_ST, KS_UID, KS_DID)');
    process.exit(1);
}

var Task = process.env.Task || 'all';
var COIN_LIMIT = parseInt(process.env.COIN_LIMIT || 550000);
var ROUNDS = parseInt(process.env.ROUNDS || 40);
var LOW_REWARD_THRESHOLD = parseInt(process.env.LOW_REWARD_THRESHOLD || 200);
var LOW_REWARD_LIMIT = parseInt(process.env.LOW_REWARD_LIMIT || 3);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function buildAdRequestBody(adType) {
    var subPageId = (adType === 606) ? 100024064 : 100026367;

    return JSON.stringify({
        appInfo: {
            appId: "kuaishou_nebula",
            name: "\u5feb\u624b\u6781\u901f\u7248",
            packageName: "com.kuaishou.nebula",
            version: "12.11.10.9145",
            versionCode: -1
        },
        deviceInfo: {
            oaid: "",
            osType: 1,
            osVersion: "10",
            language: "zh",
            deviceId: did,
            screenSize: { width: 1080, height: 2068 },
            ftt: ""
        },
        networkInfo: { ip: "0.0.0.0", connectionType: 100 },
        geoInfo: { latitude: 0, longitude: 0 },
        userInfo: { userId: uid, age: 0, gender: "" },
        impInfo: [{
            pageId: 11101,
            subPageId: subPageId,
            action: 0,
            width: 0,
            height: 0,
            browseType: 3,
            requestSceneType: 1,
            lastReceiveAmount: 0,
            impExtData: '{"openH5AdCount":0,"neoParams":""}',
            mediaExtData: "{}",
            session: '{"id":"' + generateUUID() + '"}'
        }],
        recoReportContext: '{"adClientInfo":{"shouldShowAdProfileSectionBanner":null,"profileAuthorId":0,"xiaomiCustomMarketInfo":{"support":true,"detailStyle":"1,2,3,5,100,101,102"}}}'
    });
}

function computeSig(queryStr, postStr, userSalt) {
    var allParamsStr = queryStr + '&' + postStr;
    var params = {};
    allParamsStr.split('&').forEach(function (item) {
        var eqIdx = item.indexOf('=');
        if (eqIdx > 0) {
            var key = item.substring(0, eqIdx);
            var value = item.substring(eqIdx + 1);
            params[key] = value;
        }
    });

    var sortedKeys = Object.keys(params).sort();
    var parts = [];
    for (var i = 0; i < sortedKeys.length; i++) {
        var key = sortedKeys[i];
        if (key === 'sig' || key === '__NStokensig') continue;
        var value = params[key];
        try { value = decodeURIComponent(value); } catch (e) { }
        parts.push(key + '=' + value);
    }

    var sigString = parts.join('') + userSalt;
    return crypto.createHash('md5').update(sigString).digest('hex');
}

function computeNsTokenSig(sig, clientSalt) {
    return crypto.createHash('sha256').update(sig + clientSalt).digest('hex');
}

async function httpRequest(options, name) {
    try {
        var config = {
            method: options.method || 'GET',
            url: options.url,
            headers: options.headers || {},
            data: options.body || options.form || undefined
        };
        var response = await axios(config);
        return response.data;
    } catch (error) {
        if (error.response) return error.response.data;
        return { error: error.message };
    }
}

class UserInfo {
    constructor() {
        this.index = 1;
        this.salt = salt;
        this.path = '/rest/r/ad/task/report';
        this.query = 'mod=Xiaomi%28MI%208%20Lite%29&appver=12.11.10.9145&egid=' + egid + '&did=' + did;
        this.encData = '';
        this.sign = '';
        this.boxEncData = '';
        this.boxSign = '';
    }

    getAdHeaders() {
        return {
            'Host': 'api.e.kuaishou.com',
            'Connection': 'keep-alive',
            'User-Agent': 'kwai-android aegon/3.56.0',
            'Accept-Language': 'zh-cn',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': 'kuaishou.api_st=' + api_st
        };
    }

    getReportHeaders() {
        return {
            'Host': 'api.e.kuaishou.cn',
            'User-Agent': 'kwai-android aegon/3.56.0',
            'Cookie': 'kuaishou.api_st=' + api_st,
            'page-code': 'NEW_TASK_CENTER',
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Client-Info': 'model=V2049A;os=Android;nqe-score=33;network=WIFI;'
        };
    }

    async getEncData() {
        console.log('[准备] 正在请求本地签名服务 (设备: ' + DEVICE_ID + ')...');
        try {
            var adBody = buildAdRequestBody(672);
            console.log('[准备] 加密数据长度(672): ' + adBody.length);
            var encRes = await axios.post(BASE_URL + '/encdata?device=' + DEVICE_ID, { data: adBody });
            this.encData = encRes.data.result;

            var signRes = await axios.post(BASE_URL + '/sign?device=' + DEVICE_ID, { data: adBody });
            this.sign = signRes.data.result;

            var boxBody = buildAdRequestBody(606);
            console.log('[准备] 加密数据长度(606): ' + boxBody.length);
            var boxEncRes = await axios.post(BASE_URL + '/encdata?device=' + DEVICE_ID, { data: boxBody });
            this.boxEncData = boxEncRes.data.result;

            var boxSignRes = await axios.post(BASE_URL + '/sign?device=' + DEVICE_ID, { data: boxBody });
            this.boxSign = boxSignRes.data.result;

            if (this.encData && this.sign && this.boxEncData && this.boxSign) {
                console.log('获取本地签名成功 (ad encData长度: ' + this.encData.length + ', box encData长度: ' + this.boxEncData.length + ')');
                return true;
            } else {
                console.error('获取签名返回为空');
                return false;
            }
        } catch (e) {
            console.error('连接签名服务失败: ' + e.message);
            return false;
        }
    }

    async getTaskInfo(type) {
        if (!this.encData) {
            var ok = await this.getEncData();
            if (!ok) return;
        }

        var currentEnc = (type === 606) ? this.boxEncData : this.encData;
        var currentSign = (type === 606) ? this.boxSign : this.sign;

        var adUrl = 'https://api.e.kuaishou.cn/rest/e/reward/mixed/ad';

        console.log('[广告请求] type=' + type);
        console.log('[广告请求] encData长度: ' + currentEnc.length + ', 前50字符: ' + currentEnc.substring(0, 50));
        console.log('[广告请求] sign值: ' + currentSign);

        try {
            var response = await axios({
                method: 'post',
                url: adUrl,
                headers: {
                    'Host': 'api.e.kuaishou.com',
                    'Connection': 'keep-alive',
                    'User-Agent': 'kwai-android aegon/3.56.0',
                    'Accept-Language': 'zh-cn',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': 'kuaishou.api_st=' + api_st
                },
                data: 'encData=' + encodeURIComponent(currentEnc)
                    + '&sign=' + encodeURIComponent(currentSign)
                    + '&client_key=2ac2a76d'
            });
            var result = response.data;
        } catch (error) {
            if (error.response) {
                var result = error.response.data;
                console.log('[广告响应] HTTP ' + error.response.status + ': ' + JSON.stringify(result).substring(0, 300));
            } else {
                console.error('[广告请求] 网络错误: ' + error.message);
                return;
            }
        }

        console.log('[广告响应] ' + JSON.stringify(result).substring(0, 300));

        if (result && result.errorMsg == 'OK') {
            try {
                var s = result.feeds[0].exp_tag;
                var parts = s.split('/');
                var ss = parts[1];
                var f = ss.split('_')[0];

                var cid = result.feeds[0].ad.creativeId;
                var llsid = f;
                var tp = result.feedType;

                console.log('[任务] 获取成功 type=' + type + ', cid=' + cid + ', feedType=' + tp);

                if (tp === 0) {
                    await this.doSig3(cid, llsid, type, 'video');
                }
            } catch (e) {
                console.log('解析任务数据异常: ' + e.message);
            }
        } else if (result) {
            console.log('获取任务失败: result=' + result.result + ', errorMsg=' + result.errorMsg);
            if (result.result === 50) {
                console.log('[诊断] error 50 = 需要sig查询参数，正在重试...');
                await this.getTaskInfoWithSig(type, currentEnc, currentSign);
            } else if (result.result === 6001) {
                console.log('[诊断] error 6001 = encData无效或账号问题');
            }
        }
    }

    async getTaskInfoWithSig(type, currentEnc, currentSign) {
        var postData = 'encData=' + encodeURIComponent(currentEnc)
            + '&sign=' + encodeURIComponent(currentSign)
            + '&client_key=2ac2a76d';

        var adPath = '/rest/e/reward/mixed/ad';

        var sig = computeSig(this.query, postData, this.salt);
        console.log('[重试-sig模式] sig(MD5): ' + sig);

        var sig3Res = await axios.post(BASE_URL + '/nssig3?device=' + DEVICE_ID, { data: adPath + sig });
        var sig3 = sig3Res.data.result;

        var sigToken = computeNsTokenSig(sig, this.salt);

        var fullUrl = 'https://api.e.kuaishou.cn' + adPath + '?'
            + this.query
            + '&sig=' + sig
            + '&__NS_sig3=' + sig3
            + '&__NS_xfalcon='
            + '&__NStokensig=' + sigToken;

        try {
            var response = await axios({
                method: 'post',
                url: fullUrl,
                headers: {
                    'Host': 'api.e.kuaishou.com',
                    'Connection': 'keep-alive',
                    'User-Agent': 'kwai-android aegon/3.56.0',
                    'Accept-Language': 'zh-cn',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': 'kuaishou.api_st=' + api_st
                },
                data: postData
            });
            var result = response.data;
        } catch (error) {
            if (error.response) {
                var result = error.response.data;
            } else {
                console.error('[重试] 网络错误: ' + error.message);
                return;
            }
        }

        console.log('[重试-sig模式] 响应: ' + JSON.stringify(result).substring(0, 300));

        if (result && result.errorMsg == 'OK') {
            try {
                var s = result.feeds[0].exp_tag;
                var parts = s.split('/');
                var ss = parts[1];
                var f = ss.split('_')[0];

                var cid = result.feeds[0].ad.creativeId;
                var llsid = f;
                var tp = result.feedType;

                console.log('[任务] 获取成功(sig模式) type=' + type + ', cid=' + cid + ', feedType=' + tp);

                if (tp === 0) {
                    await this.doSig3(cid, llsid, type, 'video');
                }
            } catch (e) {
                console.log('解析任务数据异常: ' + e.message);
            }
        } else if (result) {
            console.log('[重试] 也失败了: result=' + result.result + ', errorMsg=' + result.errorMsg);
        }
    }

    async doSig3(cid, llsid, t, tt) {
        var ts = Date.now();
        var ts25 = ts - 25000;
        var postData = '';

        if (t === 672) {
            postData = 'bizStr={"businessId":' + t + ',"endTime":' + ts25 + ',"extParams":"","mediaScene":"' + tt + '","neoInfos":[{"creativeId":' + cid + ',"extInfo":"","llsid":' + llsid + ',"requestSceneType":7,"taskType":2,"watchExpId":"","watchStage":0},{"creativeId":' + cid + ',"extInfo":"","llsid":' + llsid + ',"requestSceneType":1,"taskType":3,"watchExpId":"","watchStage":0}],"pageId":11101,"posId":24067,"reportType":0,"sessionId":"","startTime":' + ts + ',"subPageId":100026367}&cs=false&client_key=2ac2a76d';
        } else if (t === 606) {
            postData = 'bizStr={"businessId":' + t + ',"endTime":' + ts25 + ',"extParams":"","mediaScene":"' + tt + '","neoInfos":[{"creativeId":' + cid + ',"extInfo":"","llsid":' + llsid + ',"requestSceneType":7,"taskType":2,"watchExpId":"","watchStage":0}],"pageId":11101,"posId":20346,"reportType":0,"sessionId":"","startTime":' + ts + ',"subPageId":100024064}&cs=false&client_key=2ac2a76d';
        }

        try {
            var sig = computeSig(this.query, postData, this.salt);
            console.log('[签名] sig(MD5): ' + sig);

            var nsSig3Input = this.path + sig;
            var sig3Res = await axios.post(BASE_URL + '/nssig3?device=' + DEVICE_ID, { data: nsSig3Input });
            var sig3 = sig3Res.data.result;
            console.log('[签名] __NS_sig3: ' + sig3);

            var sigToken = computeNsTokenSig(sig, this.salt);
            console.log('[签名] __NStokensig: ' + sigToken);

            if (sig3) {
                await this.reportAd(sig, sig3, sigToken, postData, t);
            }
        } catch (e) {
            console.error('计算签名失败: ' + e.message);
        }
    }

    async reportAd(sig, sig3, sigToken, postData, type) {
        var reportUrl = 'https://api.e.kuaishou.com/rest/r/ad/task/report?' + this.query + '&sig=' + sig + '&__NS_sig3=' + sig3 + '&__NS_xfalcon=&__NStokensig=' + sigToken;

        var options = {
            method: "post",
            url: reportUrl,
            headers: this.getReportHeaders(),
            body: postData
        };

        var result = await httpRequest(options, 'reportAd');

        if (result.result == 1) {
            console.log('[奖励] 获得金币: ' + result.data.neoAmount + ' (总: ' + result.data.totalCoin + ')');
        } else {
            console.log('[上报] code=' + result.result + ', msg=' + result.errorMsg);
        }
    }
}

async function start() {
    console.log('开始运行任务');
    console.log('设备ID: ' + DEVICE_ID);
    console.log('任务类型: ' + Task + ', 轮数: ' + ROUNDS);
    console.log('参数: api_st=' + (api_st ? api_st.substring(0, 10) + '...' : 'empty') + ', uid=' + uid + ', egid=' + (egid ? egid.substring(0, 10) + '...' : 'empty') + ', did=' + did + ', salt=' + salt);

    var user = new UserInfo();

    var ready = await user.getEncData();
    if (!ready) {
        console.log('初始化签名失败，退出');
        return;
    }

    for (var i = 0; i < ROUNDS; i++) {
        console.log('\n--- 第 ' + (i + 1) + ' / ' + ROUNDS + ' 轮 ---');

        if (Task === 'all' || Task === 'food') {
            await user.getTaskInfo(672);
            await sleep(2000);
        }

        if (Task === 'all' || Task === 'box') {
            await user.getTaskInfo(606);
            await sleep(2000);
        }

        var delay = Math.floor(Math.random() * 5000) + 5000;
        console.log('休息 ' + delay + 'ms...');
        await sleep(delay);
    }

    console.log('所有任务完成');
}

start();
