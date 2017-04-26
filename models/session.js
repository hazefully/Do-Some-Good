var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var SessionSchema = new Schema({
	sender_id: Number,
	step: {type: Number, default: 0},
	new_entry: Schema.Types.Mixed
});

var session = mongoose.model("session", SessionSchema);

module.exports.model = session;

module.exports.start = function(event, callback) {
	session.find({'sender_id' : event.sender.id}, function(err, results) {
		if(err || !results.length)
			callback(event, new session({'sender_id': event.sender.id}));
		else
			callback(event, results[0]);
	});
}

module.exports.end = function(sessionObj) {
	session.remove(sessionObj, function(err) {
		if(err)
			console.error("Couldn't remove session!");
		else
			console.log("Session Removed Successfully");
	});
}