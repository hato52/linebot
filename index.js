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

            let to_user = [];
            // メッセージの送信先をDBから取得して送信先文字列を形成
            db_client.query("SELECT id FROM destination WHERE type='userId'", (err, res) => {
                if (err) {
                    console.log(err);
                }

                res.rows.forEach((row) => {
                    to_user.push(row['id']);
                });

                // PUSHメッセージの送信
                //console.log(to_user);
                client.multicast(to_user, message)
                .then(() => {
                    console.log("PUSHメッセージの送信完了 送信先：" + to_user);
                })
                .catch((err) => {
                    console.log(err);
                });
            });

            // グループには１件ずつ送信
            db_client.query("SELECT id FROM destination WHERE type='groupId'", (err, res) => {
                if (err) {
                    console.log(err);
                }

                res.rows.forEach((row) => {
                    client.pushMessage(row['id'], message)
                    .then(() => {
                        console.log("PUSHメッセージの送信完了 送信先：" + row['id']);
                    })
                    .catch((err) => {
                        console.log(err);
                    });
                })
            });
        } else {
            console.log("平常運行です");
        }
    });
}, null, true);

// webhookのルーティング設定
app.post('/bot/webhook', line.middleware(line_config), (req, res, next) => {
    res.sendStatus(200);

    // イベントオブジェクトを順次処理。
    req.body.events.forEach((event) => {
        let query;
        switch (event.type) {
            // メッセージイベント
            case 'message':
                if (event.message.type == 'text') {
                    if (event.message.text == '遅延'){
                        request.get('https://tetsudo.rti-giken.jp/free/delay.json', (err,res,body) => {
                            if (err) {
                                console.log(err);
                                return;
                            }

                            // 取得したJSONをパースする
                            let train = "";
                            let json = JSON.parse(body);
                            json.forEach((data) => {
                                train += ("\n・" + data.name);
                            });

                            // 遅延情報があればPUSHメッセージの送信
                            console.log("遅延が発生しています");
                            const message = {
                                type: 'text',
                                text: '現在、以下の交通網に遅延が発生しています\n' + train
                            };

                            client.replyMessage(event.replyToken, message)
                            .then(() => {
                                console.log("リプライメッセージの送信完了");
                            })
                            .catch((err) => {
                                console.log(err);
                            });
                        });
                    }
                }
                break;

            // ルーム参加イベント
            case 'join':
                //console.log(event.source.groupId);

                // グループIDをDBに保存
                query = {
                    text: 'INSERT INTO destination(id, type) VALUES($1, $2)',
                    values: [event.source.groupId, 'groupId']
                };
    
                db_client.query(query, (err, res) => {
                    if (err) {
                        console.log(err);
                    }
                });
                break;

            // フォローイベント
            case 'follow':
                //console.log(event.source.userId);

                // ユーザIDをDBに保存
                query = {
                    text: 'INSERT INTO destination(id, type) VALUES($1, $2)',
                    values: [event.source.userId, 'userId']
                };
    
                db_client.query(query, (err, res) => {
                    if (err) {
                        console.log(err);
                    }
                });
                break;

            // ルーム退出イベント
            case 'leave':
                //console.log(event.source.groupId);

                query = {
                    text: 'DELETE FROM destination WHERE id=$1',
                    values: [event.source.groupId]
                }

                db_client.query(query, (err, res) => {
                    if (err) {
                        console.log(err);
                    }
                });
                break;

            // フォロー解除イベント
            case 'unfollow':
                //console.log(event.source.userId);

                query = {
                    text: 'DELETE FROM destination WHERE id=$1',
                    values: [event.source.userId]
                }

                db_client.query(query, (err, res) => {
                    if (err) {
                        console.log(err);
                    }
                });
                break;

            default:
                break;
        }
    });
});