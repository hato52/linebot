const request = require('request');
const express = require('express');
const line = require('@line/bot-sdk');
const CronJob = require('cron').CronJob;
const Client = require('pg').Client;

// 初期化
// LINEのあれこれ
const line_config = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

// DBのあれこれ
const db_client = new Client({
    connectionString: process.env.DATABASE_URL
});
db_client.connect();

// サーバのあれこれ
const app = express();
app.listen(process.env.PORT || 3000);

// APIコールのためのクライアントインスタンスを作成
const client = new line.Client(line_config);

// cronのジョブ設定
// 平日に20分置きに取得 通勤と退勤のタイミングのみ
new CronJob('0 */20 5-7,17-19 * * 1-5', () => {
    // 遅延情報の取得とPUSHメッセージの送信
    request.get('https://tetsudo.rti-giken.jp/free/delay.json', (err,res,body) => {
        if (err) {
            console.log(err);
            return;
        }

        let delay_flag = false;
        // 取得したJSONをパースする
        let train = "";
        let json = JSON.parse(body);
        json.forEach((data) => {
            if (data.name == "京浜東北線" || data.name == "埼京線" || data.name == "京王線" || data.name == "東武東上線" || data.name == "武蔵野線") {
                delay_flag = true;
                train += ("\n・" + data.name);
            }
        });

        // 遅延情報があればPUSHメッセージの送信
        if (delay_flag == true) {
            console.log("遅延が発生しています");
            const message = {
                type: 'text',
                text: '現在、以下の交通網に遅延が発生しています\n' + train
            };

            client.pushMessage(process.env.LINE_USER_ID, message)
            .then(() => {
                console.log("PUSHメッセージの送信完了");
            })
            .catch((err) => {
                console.log(err);
            });
        } else {
            console.log("平常運行です");
        }
    });
}, null, true);

// webhookのルーティング設定
app.post('/bot/webhook', line.middleware(line_config), (req, res, next) => {
    res.sendStatus(200);

    let events_processed = [];

    // イベントオブジェクトを順次処理。
    req.body.events.forEach((event) => {

        // メッセージイベントの取得
        if (event.type == 'message' && event.message.type == 'text'){
            // ユーザーからのテキストメッセージが「こんにちは」だった場合のみ反応。
            if (event.message.text == 'こんにちは'){
                // replyMessage()で返信し、そのプロミスをevents_processedに追加。
                events_processed.push(client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: 'いえあ'
                }));
            }
        }

        // ルーム参加イベントの取得
        if (event.type == 'join') {
            console.log(event.source.groupId);

            // グループIDをDBに保存
            const query = {
                text: 'INSERT INTO destination(id) VALUES($1)',
                value: event.source.groupId
            };

            db_client.query(query, (err, res) => {
                if (err) {
                    console.log(err);
                }
            });
        }

        // フォローイベントの取得
        if (event.type == 'follow') {
            console.log(event.source.userId);

            // ユーザIDをDBに保存
            const query = {
                text: 'INSERT INTO destination(id) VALUES($1)',
                value: event.source.userId
            };

            db_client.query(query, (err, res) => {
                if (err) {
                    console.log(err);
                }
            });
        }

        if (event.type == 'unfollow') {
            console.log(event.source.userId);

            // ユーザIDをDBに保存
            const query = {
                text: 'INSERT INTO destination(id) VALUES($1)',
                value: event.source.userId
            };

            db_client.query(query, (err, res) => {
                if (err) {
                    console.log(err);
                }
            });
        }
    });

    // すべてのイベント処理が終了したら何個のイベントが処理されたか出力。
    Promise.all(events_processed).then(
        (response) => {
            console.log(`${response.length} event(s) processed.`);
        }
    );
});