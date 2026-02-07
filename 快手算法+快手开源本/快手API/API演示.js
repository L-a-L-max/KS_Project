const 看广告请求参数 = {
  appInfo: {
    appId: "kuaishou_nebula",
    name: "快手极速版",
    packageName: "com.kuaishou.nebula",
    version: "12.11.40.9331", //随便 最好固定和你自己的
    versionCode: -1,
  },
  deviceInfo: {
    oaid: "9e4bb0e5bc326fb1",
    osType: 1,
    osVersion: "10",
    language: "zh",
    deviceId: "ANDROID_xxxxx", //did
    screenSize: { width: 1080, height: 2068 },
    ftt: "",
  },
  networkInfo: { ip: "192.168.31.223", connectionType: 100 }, //IP也写自己的
  geoInfo: { latitude: 0, longitude: 0 },
  userInfo: { userId: "xxxxxx", age: 0, gender: "" }, //userId写自己的
  impInfo: [
    {
      pageId: 11101, //不知道哪来的忘了 应该固定
      subPageId: 100026367, //不知道哪来的忘了 应该固定
      action: 0,
      width: 0,
      height: 0,
      browseType: 3,
      requestSceneType: 1,
      lastReceiveAmount: 0,
      impExtData: '{"openH5AdCount":0,"neoParams":""}', //neoParams广告参数应该是
      mediaExtData: "{}",
      session: '{"id":""}', //uuid随机数
    },
  ],
  recoReportContext:
    '{"adClientInfo":{"shouldShowAdProfileSectionBanner":null,"profileAuthorId":0,"xiaomiCustomMarketInfo":{"support":true,"detailStyle":"1,2,3,5,100,101,102"}}}',
};
//看广告请求参数 POST 请求到本地API服务  127.0.0.1:5000/encdata POST传参data
//获取加密后的参数
//请求 127.0.0.1/5000/sign n POST传参data 获取sign
let data = {
  encData: "", //加密后的参数
  sign: "", //sign
  cs: "false",
  client_key: "2ac2a76d",
  videoModelCrowdTag: "",
  os: "android",
  "kuaishou.api_st": "" + this.apist,
  uQaTag: "",
};
//请求https://api.e.kuaishou.com/rest/e/reward/mixed/ad
//GET传参里面要计算下nssig3和sig和nstokensig
//这三个我已经打包到文件夹里面了
//把请求data和params的传参拼接data + "&" + qs.stringify(options.params)  通过 sig和nstokensig.js计算出两个参数
//计算nssig3为  path+sig 传参过去返回48位sig

//params里面拼接上 nssig3  sig nstokensig 三个参数就请求成功
//提交广告接口 https://api.e.kuaishou.com/rest/e/reward/mixed/ad
//请求data已给出  params自己抓包找
//广告请求参数生成原理 最近几天会写出来

//奖励领取接口https://api.e.kuaishou.com/rest/r/ad/task/report
//startTime 和 endTime 随机 
//sessionId 为 UUID随机数
data = {
            'bizStr': '{"businessId":672,"endTime":' + endTime + ',"extParams":"' + extParams + '","mediaScene":"video","neoInfos":[{"creativeId":' + creativeId + ',"extInfo":"","llsid":' + lsid + ',"requestSceneType":1,"taskType":1,"watchExpId":"","watchStage":0},{"creativeId":' + creativeId + ',"extInfo":"","llsid":' + lsid + ',"requestSceneType":1,"taskType":6,"watchExpId":"","watchStage":0}],"pageId":11101,"posId":24067,"reportType":0,"sessionId":"' + sessionId + '","startTime":' + startTime + ',"subPageId":' + subPageId + '}',
            'cs': 'false',
            'client_key': '2ac2a76d',
            'videoModelCrowdTag': '',
            'os': 'android',
            'kuaishou.api_st': '' + this.apist,
            'uQaTag': ''
        }
        //其他具体抓包分析吧 懒得写了..
        //不会可以群里问我