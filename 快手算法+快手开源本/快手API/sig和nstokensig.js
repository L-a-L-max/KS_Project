const MD5 = require('js-md5'); // 需要安装js-md5库

class SingatureUtil {
    static FANS_SALT = "772867c19925";

    static genSignature(params, salt) {
        if (!params) return null;

        let sign = "";
        let sortedKeys = Object.keys(params).sort();
        let sb = [];

        // 排序并拼接键值对
        for (const key of sortedKeys) {
            if (["sig", "__NStokensig"].includes(key)) continue;

            let value = params[key];
            try {
                value = decodeURIComponent(value); // URL解码
            } catch (e) {
                console.error(`Decoding error for key ${key}: ${e.message}`);
            }

            sb.push(`${key}=${value}`);
        }

        let uriString = sb.join("") + salt;

        console.log(uriString);

        // MD5签名
        sign = MD5(uriString);
        console.log("\nGenerated Sign:\n", sign);

        return sign;
    }

    static getMapFromStr(str) {
        if (!str) return null;

        const params = {};
        const arr = str.split('&');
        for (const item of arr) {
            const parts = item.split('=', 2);
            if (parts.length === 2) {
                params[parts[0]] = parts[1];
            }
        }

        return params;
    }

    static main() {
        const srcStr = "inviteCode=995915686&sourceType=13&sync=1&traceDetail=c1_s2_a5.e6.pca725edf-e56a-4507-9df1-e5d990d9dcfa.f2.989645030.0.0_os2&durationSec=0&cs=false&client_key=2ac2a76d&videoModelCrowdTag=1_61&os=android&kuaishou.api_st=Cg9rdWFpc2hvdS5hcGkuc3QSoAHtGKWZIRlassvuY-kcd4e99_VNtVFg8As1tU9uf5uuIxX49WsXTCMfLCD-lE9eEQvHLYskDQdJNOuJP-lEbYp_wtdvEqjbltATotmmWRBf02lRJQEjctK1yXNqXcZCrIM-DCc1MiUU_T8h72_zcCzfXV9rJvB5mUkyYG49qVHzRAN9DJYpZo2-tJrtgYLRva2etzJVoccVEsBzCdfDtmNAGhIBsEvrYUJIEr3QAbL9uj1zIhsiIGtxWEjI7cOuDX7PT4Ha7IJ8YMMg3r2i9xVwRB1YpWrJKAUwAQ&uQaTag=515%2333333333338888888888%23ecLd%3A-8%23swRs%3A-8%23swLdgl%3A99%23ecPp%3A-9%23cmNt%3A-1&earphoneMode=1&mod=Xiaomi%28MI 8 Lite%29&appver=12.11.40.9331&isp=&language=zh-cn&ud=989645030&did_tag=0&egid=DFPCE984C89DC88AB99CF68D053912C187EAEA08CF8156023E3F13F2A9786C17&thermal=10000&net=WIFI&kcv=1598&app=0&kpf=ANDROID_PHONE&bottom_navigation=true&ver=12.11&android_os=0&oDid=ANDROID_93c3e92b06348115&boardPlatform=sdm660&kpn=NEBULA&newOc=XIAOMI&androidApiLevel=29&slh=0&country_code=cn&nbh=130&hotfix_ver=&did_gt=1736155760953&keyconfig_state=2&cdid_tag=7&sys=ANDROID_10&max_memory=256&cold_launch_time_ms=1740655601417&oc=XIAOMI&sh=2280&deviceBit=0&browseType=3&ddpi=440&socName=Qualcomm Snapdragon 660&is_background=0&c=XIAOMI&sw=1080&ftt=&apptype=22&abi=arm64&userRecoBit=0&device_abi=arm64&icaver=1&totalMemory=5724&grant_browse_type=AUTHORIZED&iuid=&rdid=ANDROID_841f98ccff840cd0&sbh=82&darkMode=false&did=ANDROID_ea6b06ac1997a8a3&sig=cd6e50bd2ca891938121fb2ae623f5e9";
        const params = SingatureUtil.getMapFromStr(srcStr);
        const signature = SingatureUtil.genSignature(params, SingatureUtil.FANS_SALT);
        console.log("Final Signature:", signature);
    }
}
function getNTTOKENSig(sig, ClientSalt) {
    //计算nstokensig
    //SHA256
    const hash = crypto.createHash('sha256').update(sig + ClientSalt).digest('hex');
    return hash;
}
// 测试
SingatureUtil.main();//计算sig