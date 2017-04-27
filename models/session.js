var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var SessionSchema = new Schema({
	user_id: Number,
	fresh: {type: Boolean, default: true},
	step: {type: Number, default: 0},
	offset: {type: Number, default: 0},
	long: {type: Number, default: 0},
	lat: {type: Number, default: 0},
	new_entry: Schema.Types.Mixed
});

var session = mongoose.model("session", SessionSchema);

module.exports.model = session;

module.exports.start = function(event, callback) {
	session.find({'user_id' : event.sender.id}, function(err, results) {
		if(err || !results.length)
			callback(event, new session({'user_id': event.sender.id}));
		else
			callback(event, results[0]);
	});
}

module.exports.end = function(sessionObj) {
	//console.log("-----------------");
	//console.log(sessionObj);
	sessionObj.remove();
	/*session.remove(sessionObj, function(err) {
		if(err)
			console.error("Couldn't remove session!");
		else
			console.log("Session Removed Successfully");
	});*/
}