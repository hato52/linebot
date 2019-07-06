const request = require('request');
const express = require('express');
const line = require('@line/bot-sdk');
const CronJob = require('cron').CronJob;

const app = express();

const line_config = {
    channelAccessToken: process.env.LINE_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

app.listen(process.env.PORT || 3000);

// APIコールのためのクライアントインスタンスを作成
const client = new line.Client(line_config);

// cronのジョブ設定
new CronJob('0 */20 * * * *', () => {
    console.log("遅延情報の取得");
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
            if (data.name == "京浜東北線" || data.name == "埼京線" || data.name == "京王線") {
                delay_flag = true;
                train += ("・" + data.name + "¥n");
            }
        });

        // 遅延情報があればPUSHメッセージの送信
        const message = '';
        if (delay_flag == true) {
            message = {
                type: 'text',
                text: '現在、以下の交通網に遅延が発生しています¥n' + train
            };

            client.pushMessage('U98ea37be447321d09ab130f994489f2a', message)
            .then(() => {
                console.log("PUSHメッセージの送信完了");
            })
            .catch((err) => {
                console.log(err);
            });
        }
    });
}, null, true);

// webhookのルーティング設定
app.post('/bot/webhook', line.middleware(line_config), (req, res, next) => {
    res.sendStatus(200);

    let events_processed = [];

    // イベントオブジェクトを順次処理。
    req.body.events.forEach((event) => {
        // この処理の対象をイベントタイプがメッセージで、かつ、テキストタイプだった場合に限定。
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
    });

    // すべてのイベント処理が終了したら何個のイベントが処理されたか出力。
    Promise.all(events_processed).then(
        (response) => {
            console.log(`${response.length} event(s) processed.`);
        }
    );
});