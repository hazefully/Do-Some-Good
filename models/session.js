var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var SessionSchema = new Schema({
	sender_id: Number,
	step: {type: Number, default: 0};
	//vars: Object;
});

var session = mongoose.model("session", SessionSchema);


module.exports = function(event, processMessage) {
	session.find({'sender_id' : event.sender.id}, function(err, results) {
		if(err || !results.length)
			processMessage(event, new session({'sender_id': event.sender.id}));
		else
			processMessage(event, results[0]);
	});
}