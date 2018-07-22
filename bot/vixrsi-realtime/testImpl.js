const io = require('socket.io-client');
const socket = io("https://io.lightstream.bitflyer.com", {transports: ["websocket"] });

const channelName = "lightning_ticker_BTC_JPY";
socket.on("connect", () => {
	socket.emit("subscribe", channelName);
});

socket.on(channelName, message => {
	console.log(channelName, message);
});
