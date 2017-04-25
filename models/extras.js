var mongoose = require("mongoose");
var Schema = mongoose.Schema;


var Status = new Schema({
	entity_id: String,
	status_updates: [{ body: String, date: Date }];
});

var Votes = new Schema({
	entity_id: String;
	votes: [{id: String}];
});

module.exports.status = mongoose.model("status", Status);
module.exports.votes = mongoose.model("votes", Votes);