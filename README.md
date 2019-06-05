# BitFlyerAutoTradeBot

BitFlyerにて自動取引を行うbotです。

# 動かし方
Node.jsが動作する環境が必要です。
Linuxサーバーで常設プログラムとして動かすことを想定しています.

bot/vixrsi/vixrsi_bot.jsをnodeで起動することで稼働し始めます.

	
	$ cd BitFlyerAutoTrader
	$ npm install //初回起動時のみ
    $ cp ecosystem.config.js.sample ecosystem.config.js
    $ vi ecosystem.config.js //API_KEYとAPI_SECRETを変更
	$ pm2 start ecosystem.config.js //初回起動時のみ
	$ pm2 start bfat //2回目以降の起動時
	