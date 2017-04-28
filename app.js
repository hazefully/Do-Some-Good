var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");
var mongoose = require("mongoose");

var db = mongoose.connect(process.env.MONGODB_URI);

var entry = require("./models/entry");
var session = require("./models/session");

var app = express();

app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());

app.get("/", function(req, res) {
    res.send("Deployed!");
});

app.get("/webhook", function(req, res) {
    if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
        console.log("Verified webhook");
        res.status(200).send(req.query["hub.challenge"]);
    } else {
        console.error("Verification failed. The tokens do not match.");
        res.sendStatus(403);
    }
});

app.post('/webhook', function(req, res) {
    var data = req.body;

    if (data.object === 'page') {

        data.entry.forEach(function(entry) {
            var pageID = entry.id;
            var timeOfEvent = entry.time;

            entry.messaging.forEach(function(event) {
                console.log(event);
                sendSeenAndTyping(event);
                if (event.message) {
                    // All message events should be handled in processMessage()
                    session.start(event, processMessage);
                } else if (event.postback) {
                    // All postback events should be handled in processPostback()
                    session.start(event, processPostback);
                } else {
                    console.log("Webhook recieved unknown event!");
                }
            });
        });
        res.sendStatus(200);
    }
});

function restartSession(event, sessionObj, callback) {
    console.log("Restarting Session!");
    sessionObj.remove(function(err, sessionObj) {
        if (err)
            console.error("Couldn't remove sessionObj!");
        else
            console.log("Session Removed Successfully!");
        session.start(event, callback);
    });
}

function processMessage(event, sessionObj) {

    var messageText = event.message.text;
    console.log("New Message recieved!");
    if (sessionObj.step) {
        // if there's ongoing create new entry process
        createNewEntry(event, sessionObj);
    }
    if (sessionObj.upd_step) {
        findEntry(event, sessionObj);
    } else if (sessionObj.status_upd) {
        if (!event.message.text) {
            sendTextMessage(sessionObj.user_id, "Invalid response! Please try again").
            getStarted(event, sessionObj);
        } else {
            addStatusUpdate(event, sessionObj);
        }
    } else if (messageText && messageText.toUpperCase() == "Add Status Update".toUpperCase()) {
        triggerNewStatusUpdate(event, sessionObj);
    } else if (messageText && messageText.toUpperCase() == "View status history".toUpperCase()) {
        showStatusUpdates(event, sessionObj);
    } else if (messageText && messageText.toUpperCase() == "Upvote".toUpperCase()) {
        getEntryFromID(event, sessionObj, doUpvote);

    } else if (messageText && messageText.toUpperCase() == "Downvote".toUpperCase()) {
        getEntryFromID(event, sessionObj, doDownvote);

    } else if (messageText && messageText.toUpperCase() == "Delete This Entry".toUpperCase()) {
        getEntryFromID(event, sessionObj, deleteEntry);
        setTimeout(function() {
            getStarted(event, sessionObj);
        }, 1000);
    } else {
        getStarted(event, sessionObj);
    }
    sendStopTyping(event);
}

function doUpvotes(sessionObj, theEntry) {
    if(theEntry.upvotes.indexOf(sessionObj.user_id) > -1)
        sendTextMessage(sessionObj.user_id, "Sorry, You can only vote once!");
    else {
        theEntry.upvotes.push(sessionObj.user_id);
        sendTextMessage(sessionObj.user_id, "Thanks for your contribution.");
    }
    setTimeout(function(){
        getEntryFromID(event, sessionObj, showEntryOptions);
    }, 1000);
}

function doDownvotes(sessionObj, theEntry) {
    if(theEntry.downvotes.indexOf(sessionObj.user_id) > -1)
        sendTextMessage(sessionObj.user_id, "Sorry, You can only vote once!");
    else {
        theEntry.downvotes.push(sessionObj.user_id);
        sendTextMessage(sessionObj.user_id, "Thanks for your contribution.");
    }
    setTimeout(function(){
        getEntryFromID(event, sessionObj, showEntryOptions);
    }, 1000);
}

function deleteEntry(sessionObj, theEntry) {
    theEntry.remove();
    sendTextMessage(sessionObj.user_id, "Entry removed successfully!");
}

function triggerNewStatusUpdate(event, sessionObj) {
    sessionObj.status_upd = true;
    sessionObj.save();
    sendTextMessage(sessionObj.user_id, "Write any new updates for this call for help, be as detailed as possible, Your status update can help keep this entry up-to-date.");
}

function showStatusUpdates(event, sessionObj) {
    var id = sessionObj.last_opened_entry;
    entry.model.findById(id, function(err, result) {
        if (err || !result) {
            sendTextMessage(sessionObj.user_id, "Entry Not Found!");
        } else {
            if (!result.updates.length)
                sendTextMessage(sessionObj.user_id, "There are no status updates for this entry!");
            else {
                var message = "Found " + result.updates.length + " status updates for this entry!\n";
                message += "Staus Updates are sorted starting from the latest one.\n\n";
                for (var i = result.updates.length - 1; i >= 0; --i) {
                    message += result.updates[i] + "\n";
                    message += "Date: " + result.updateDates[i] + "\n\n";
                }
                sendTextMessage(sessionObj.user_id, message);
            }
            setTimeout(function(){
                getEntryFromID(event, sessionObj, showEntryOptions);
            }, 1000);
        }
        
    });
}

function addStatusUpdate(event, sessionObj) {
    var id = sessionObj.last_opened_entry;
    entry.model.findById(id, function(err, result) {
        if (err || !result) {
            sendTextMessage(sessionObj.user_id, "Entry Not Found!");
        } else {
            result.updates.push(event.message.text);
            result.updateDates.push(getDateTime());
            result.markModified('updates');
            result.markModified('updateDates');
            result.save();
            sendTextMessage(sessionObj.user_id, "Your status update was added successfully!");
        }
        sessionObj.status_upd = false;
        sessionObj.save();
        setTimeout(function(){
            getEntryFromID(event, sessionObj, showEntryOptions);
        }, 1000);
    });
}

function findEntry(event, sessionObj) {
    if (sessionObj.upd_step == 2) {
        var query_type = event.message.text;

        if (query_type == "Person's name") {
            sessionObj.query_type = "Name";
            sendTextMessage(event.sender.id, "Please specify the name of the person whose call for help you wish to open.");
            sessionObj.upd_step = 3;
            sessionObj.save();
        } else if (query_type == "Description") {
            sessionObj.query_type = "Description";
            sendTextMessage(event.sender.id, "Please specify the description of the the call for help you wish to open.");
            sessionObj.upd_step = 3;
            sessionObj.save();
        } else if (query_type == "Location") {
            sessionObj.query_type = "Location";
            getLocation(event.sender.id, "Please share the location you wish to search around.");
            sessionObj.upd_step = 3;
            sessionObj.save();
        } else {
            sendTextMessage(event.sender.id, "Invalid response, please try again!");
            setTimeout(function() {
                getStarted(event, sessionObj);
            }, 800);
        }
    } else if (sessionObj.upd_step == 3) {
        if (sessionObj.query_type != "Location") {
            var queryval = event.message.text;
            if (!queryval) {
                sendTextMessage(event.sender.id, "Invalid response, please try again!");
                setTimeout(function() {
                    getStarted(event, sessionObj);
                }, 800);
            } else {
                sessionObj.queryval = queryval;
                sessionObj.offset = 1;
                sessionObj.save();
                if (sessionObj.query_type == "Name") {
                    entry.queryByName(sessionObj, showList, "Please choose from the list the entry you would like to open.");
                } else {
                    entry.queryByDescription(sessionObj, showList, "Please choose from the list the entry you would like to open.");
                }
                sessionObj.upd_step = 0;
            }
        } else {
            attachs = event.message.attachments;
            if (!attachs || !attachs.length || attachs[0].type != 'location') {
                sendTextMessage(event.sender.id, "Invalid response, please try again!");
                setTimeout(function() {
                    getStarted(event, sessionObj);
                }, 800);
            } else {
                sessionObj.lat = attachs[0].payload.coordinates.lat;
                sessionObj.long = attachs[0].payload.coordinates.long;
                sessionObj.save();
                entry.queryByLocation(sessionObj, showList, "Here are the calls for help nearest to your shared location sorted from nearest to furthest. Please choose from the list the entry you would like to open.");
                sessionObj.upd_step = 0;
            }
        }
    }
    sessionObj.save();
}

function triggerNewEntry(event, sessionObj) {
    if (!sessionObj.fresh)
        restartSession(event, sessionObj, triggerNewEntry);
    else {
        sessionObj.fresh = false;
        sessionObj.step = 1;
        sessionObj.new_entry = new entry.model({
            user_id: sessionObj.user_id
        });
        sessionObj.markModified('new_entry');
        sessionObj.save();

        request({
            url: "https://graph.facebook.com/v2.6/" + sessionObj.user_id,
            qs: {
                access_token: process.env.PAGE_ACCESS_TOKEN,
                fields: "first_name"
            },
            method: "GET"
        }, function(error, response, body) {
            var startNewEntry = "";
            if (error) {
                console.log("Error getting user's name!");
                //console.log("Error getting user's name: " +  error);
            } else {
                var bodyObj = JSON.parse(body);
                name = bodyObj.first_name;
                startNewEntry = "Okay " + name + ", ";
            }
            var message = startNewEntry + "I will guide you through the process of adding a new entry."
            sendTextMessage(sessionObj.user_id, message);
        });
        setTimeout(function() {
            createNewEntry(event, sessionObj);
        }, 1500);
    }
}

function triggerListEntries(event, sessionObj) {
    if (!sessionObj.fresh) {
        restartSession(event, sessionObj, triggerListEntries);
    } else {
        sessionObj.fresh = false;
        sessionObj.offset = 1;
        sessionObj.save();
        getLocation(event.sender.id, "Please share your location to list the calls for help nearest to you.");
    }
}


function processPostback(event, sessionObj) {
    var userID = event.sender.id;
    var payload = event.postback.payload;
    console.log("New Postback recieved! :", payload);


    if (payload == "Greeting") {
        getStarted(event, sessionObj, true);
    } else if (payload == "NewEntry") {
        triggerNewEntry(event, sessionObj);
    }
    /*else if (payload == "ListEntries") {
      triggerListEntries(event, sessionObj);
    }*/
    else if (payload == "ViewMore") {
        if (sessionObj.offset <= 1)
            triggerFindEntry(event, sessionObj);
        //triggerListEntries(event, sessionObj);
        else if (sessionObj.upd_step) {
            if (sessionObj.query_type == "Name") {
                entry.queryByName(sessionObj, showList, "Please choose from the list the entry you would like to open.");
            } else {
                entry.queryByDescription(sessionObj, showList, "Please choose from the list the entry you would like to open.");
            }
        } else {
            entry.queryByLocation(sessionObj, showList, "Here are the calls for help nearest to your shared location sorted from nearest to furthest.");
        }
    } else if (payload.length >= 10 && payload.substring(0, 10) == "ViewEntry_") {
        var id = payload.substring(10, payload.length);
        entry.model.findById(id, function(err, result) {

            if (err || !result) {
                sendTextMessage(userID, "Entry Not Found!");
            } else {
                sessionObj.last_opened_entry = id;
                sessionObj.save();
                showEntry(sessionObj, result);
            }
        });

    } else if (payload == "ConfirmNewEntry") {
        if (sessionObj.step < 6) {
            sendTextMessage(userID, "Not enough information to create a new entry");
        } else {
            sendTextMessage(userID, "Thank you! Your efforts will help make this world a better world!");
            var newEntry = new entry.model(sessionObj.new_entry);
            newEntry.save();
        }
        getStarted(event, sessionObj);
    } else if (payload == "CancelNewEntry") {
        sendTextMessage(userID, "Your entry has been cancelled, please try again.");
        getStarted(event, sessionObj);
    } else if (payload == "FindEntry") {
        triggerFindEntry(event, sessionObj);
    }
    // all other events should be handled before this one
    else if (sessionObj.step) {
        createNewEntry(event, sessionObj);
    }
    sendStopTyping(event);
}

function triggerFindEntry(event, sessionObj) {
    if (!sessionObj.fresh) {
        restartSession(event, sessionObj, triggerFindEntry);
    } else {
        sessionObj.fresh = false;
        sessionObj.offset = 1;
        sessionObj.upd_step = 2;
        sessionObj.save();

        var messageData = {
            recipient: {
                id: event.sender.id
            },
            message: {
                text: "Please choose how you would like to search for the call for help you wish to open.",
                quick_replies: [{
                        content_type: "text",
                        title: "Person's name",
                        payload: "Person's name"
                    },
                    {
                        content_type: "text",
                        title: "Description",
                        payload: "Description"

                    },
                    {
                        content_type: "text",
                        title: "Location",
                        payload: "Location"
                    }
                ]
            }
        };
        callSendAPI(messageData);
    }
}

function sendSeenAndTyping(event) {

    var messageData = {
        recipient: {
            id: event.sender.id
        },
        sender_action: "mark_seen"
    };
    callSendAPI(messageData);

    messageData = {
        recipient: {
            id: event.sender.id
        },
        sender_action: "typing_on"
    };
    callSendAPI(messageData);
}

function sendStopTyping(event) {
    messageData = {
        recipient: {
            id: event.sender.id
        },
        sender_action: "typing_off"
    };
    callSendAPI(messageData);
}

function createNewEntry(event, sessionObj) {
    var userID = event.sender.id;
    if (event.message) {
        var messageText = event.message.text;
        var attachs = event.message.attachments;
        if (messageText == null && sessionObj.step != 3) {
            console.log("handle error");
            newEntryErrorHandling(event, sessionObj);
            return;
        }
        if (sessionObj.step == 2) {
            sessionObj.new_entry.name = messageText;
            sessionObj.markModified('new_entry');
            getLocation(userID, "Please share the location of this call for help.");
            console.log("b3d getLoaction");
        } else if (sessionObj.step == 3) {
            console.log(attachs);
            if (!attachs || !attachs.length || attachs[0].type != 'location') {
                // sendTextMessage(userID, "Invalid Input!");
                // getStarted(event, sessionObj);
                // return;
                newEntryErrorHandling(event, sessionObj);
                return;
            }
            sessionObj.new_entry.location.coordinates[1] = attachs[0].payload.coordinates.lat;
            sessionObj.new_entry.location.coordinates[0] = attachs[0].payload.coordinates.long;
            sessionObj.markModified('new_entry');

            var message = "Please specify a description for this call for help.";
            sendTextMessage(userID, message);
        } else if (sessionObj.step == 4) {
            sessionObj.new_entry.description = messageText;
            sessionObj.markModified('new_entry');

            var messageData = {
                recipient: {
                    id: userID
                },
                message: {
                    text: "Please specify the priority of this call for help",
                    quick_replies: [{
                            content_type: "text",
                            title: "High",
                            payload: "High"
                        },
                        {
                            content_type: "text",
                            title: "Medium",
                            payload: "Medium"

                        },
                        {
                            content_type: "text",
                            title: "Low",
                            payload: "Low"
                        }
                    ]
                }
            };
            callSendAPI(messageData);
        } else if (sessionObj.step == 5) {
            if (messageText != "High" && messageText != "Medium" && messageText != "Low") {
                newEntryErrorHandling(event, sessionObj);
                return;
            }
            sessionObj.new_entry.priority = messageText;
            sessionObj.markModified('new_entry');
            sendTextMessage(userID, "Okay, let's review this entry.\n");
            setTimeout(function() {
                showEntry(sessionObj, sessionObj.new_entry);
            }, 900);


            messageData = {
                recipient: {
                    id: userID
                },
                message: {
                    attachment: {
                        type: "template",
                        payload: {
                            template_type: "button",
                            text: "Are you sure you want to add this entry?",
                            buttons: [{
                                    type: "postback",
                                    title: "Yes",
                                    payload: "ConfirmNewEntry"
                                },
                                {
                                    type: "postback",
                                    title: "No",
                                    payload: "CancelNewEntry"
                                }
                            ]
                        }
                    }
                }
            };

            setTimeout(function() {
                callSendAPI(messageData);
            }, 2700);
        } else {
            sendTextMessage(userID, "Invalid Input!");
            getStarted(event, sessionObj);
            return;
        }

    } else if (event.postback) {
        var payload = event.postback.payload;
        if (sessionObj.step == 1) {
            var message = "Please enter the full name of the person that needs help. (If you wish to keep this field empty, just reply with \"N\/A\")";
            sendTextMessage(userID, message);
        } else {
            sendTextMessage(userID, "Invalid Input!");
            getStarted(event, sessionObj);
            return;
        }
    } else {
        sendTextMessage(userID, "Invalid Input!");
        getStarted(event, sessionObj);
        return;
    }
    ++sessionObj.step;
    sessionObj.save();
    console.log("hytla3 mn createNewEntry aho");
}

function showEntryOptions(sessionObj, theEntry, flag = false) {
    var messageData = {
        recipient: {
            id: sessionObj.user_id
        },
        message: {
            text: "What would you like to do next?",
            quick_replies: [{
                    content_type: "text",
                    title: "Upvote",
                    payload: "Upvote"
                },
                {
                    content_type: "text",
                    title: "Downvote",
                    payload: "Downvote"

                },
                {
                    content_type: "text",
                    title: "View Status History",
                    payload: "View Status History"
                },
                {
                    content_type: "text",
                    title: "Add Status Update",
                    payload: "Add Status Update"
                },
                {
                    content_type: "text",
                    title: "Cancel",
                    payload: "Cancel"

                }
            ]
        }
    };

    if(flag)
        messageData.message.text = "What would you like to do with this call for help?";

    if (theEntry.user_id == sessionObj.user_id)
        messageData.message.quick_replies.splice(messageData.message.quick_replies.length - 1, 0, {
            content_type: "text",
            title: "Delete This Entry",
            payload: "Delete This Entry"
        });
    callSendAPI(messageData);
}

function getEntryFromID(event, sessionObj, callback) {
    entry.model.findById(sessionObj.last_opened_entry, function(err, result) {
        if (err || !result) {
            sendTextMessage(userID, "Entry Not Found!");
        } else {
            callback(sessionObj, result);
        }
    });
}

function showEntry(sessionObj, theEntry) {
    var message = "";
    message += "Full name: " + theEntry.name + "\n";
    message += "Description: " + theEntry.description + "\n";
    message += "Priority: " + theEntry.priority + "\n";
    message += "Location: ";
    sendTextMessage(sessionObj.user_id, message);

    var long = theEntry.location.coordinates[0];
    var lat = theEntry.location.coordinates[1];
    setTimeout(function() {
        sendLocation(sessionObj, lat, long);
    }, 700);
    
    setTimeout(function() {
        showEntryOptions(sessionObj, theEntry, true);
    }, 2000);
}

function sendLocation(sessionObj, lat, long) {
    var messageData = {
        recipient: {
            id: sessionObj.user_id
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "Location",
                        image_url: "https:\/\/maps.googleapis.com\/maps\/api\/staticmap?size=764x400&center=" + lat + "," + long + "&zoom=25&markers=" + lat + "," + long,
                        item_url: "http:\/\/maps.apple.com\/maps?q=" + lat + "," + long + "&z=16"
                    }]
                }
            }
        }
    };
    callSendAPI(messageData);
}

function newEntryErrorHandling(event, sessionObj) {
    var userID = sessionObj.user_id;
    sendTextMessage(userID, "Invalid response, please try again.");
    if (sessionObj.step == 2) {
        setTimeout(function() {
            sendTextMessage(userID, "Please enter the full name of the person that needs help.");
        }, 800);
    } else {
        if (sessionObj.step == 3) {
            setTimeout(function() {
                getLocation(userID, "Please share the location of this call for help.");
            }, 800);
        } else if (sessionObj.step == 4) {
            setTimeout(function() {
                var message = "Please specify a description for this call for help.";
                sendTextMessage(userID, message);
            }, 800);
        } else if (sessionObj.step == 5) {
            var messageData = {
                recipient: {
                    id: userID
                },
                message: {
                    text: "Please specify the priority of this call for help.",
                    quick_replies: [{
                            content_type: "text",
                            title: "High",
                            payload: "High"
                        },
                        {
                            content_type: "text",
                            title: "Medium",
                            payload: "Medium"

                        },
                        {
                            content_type: "text",
                            title: "Low",
                            payload: "Low"
                        }
                    ]
                }
            };
            setTimeout(function() {
                callSendAPI(messageData);
            }, 800);
        }

        sessionObj.save();
    }
}

function getLocation(userID, message) {
    var messageData = {
        recipient: {
            id: userID
        },
        message: {
            text: message,
            quick_replies: [{
                content_type: "location"
            }]
        }
    };
    callSendAPI(messageData);
}

function showList(sessionObj, list, msg) {
    var offset = sessionObj.offset - 1;
    var elms = [];
    var btns = [];
    var firstView = false;
    if (offset == 0)
        firstView = true;
    if (offset + 4 < list.length)
        btns.push({
            title: "View More",
            type: "postback",
            payload: "ViewMore"
        });
    console.log(list);
    while (offset < list.length && elms.length < 4) {
        var titlle = list[offset].description;
        var subtitlle = "Priority: ";
        subtitlle += list[offset].priority;
        subtitlle += "/Name: ";
        subtitlle += list[offset].name;
        elms.push({
            title: titlle,
            subtitle: subtitlle,
            buttons: [{
                title: "Open",
                type: "postback",
                payload: "ViewEntry_" + list[offset]._id
            }]
        });
        ++offset;
    }
    if (offset == list.length)
        sessionObj.offset = 0;
    else
        sessionObj.offset = offset + 1;

    var messageData = {
        recipient: {
            id: sessionObj.user_id
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "list",
                    top_element_style: "compact",
                    elements: elms,
                    buttons: btns
                }
            }
        }
    }
    sessionObj.save();

    if (elms.length == 0) {
        sendTextMessage(sessionObj.user_id, "No results found!");
    } else if (elms.length == 1) {
        console.log(offset);
        console.log(list.length);
        if (sessionObj.offset == 0 && list.length > 1)
            sendTextMessage(sessionObj.user_id, "Only one call for help is left with the following details:")
        else
            sendTextMessage(sessionObj.user_id, "Found one suitable call for help with the following details:");
        setTimeout(function() {
            showEntry(sessionObj, list[list.length - 1]);
        }, 900)
    } else {
        if (firstView) {
            sendTextMessage(sessionObj.user_id, msg);
            setTimeout(function() {
                callSendAPI(messageData);
            }, 500);
        } else {
            callSendAPI(messageData);
        }

    }
}

function getStarted(event, sessionObj, welcomeMessage = false) {
    console.log("da5al getStarted");
    var userID = event.sender.id;
    if (welcomeMessage) {
        request({
            url: "https://graph.facebook.com/v2.6/" + userID,
            qs: {
                access_token: process.env.PAGE_ACCESS_TOKEN,
                fields: "first_name"
            },
            method: "GET"
        }, function(error, response, body) {
            var greeting = "";
            if (error) {
                //console.log("Error getting user's name: " +  error);
                console.log("Error getting user's name!");
            } else {
                var bodyObj = JSON.parse(body);
                name = bodyObj.first_name;
                greeting = "Hi " + name + "!\n";
            }
            var message = greeting + "This messanger bot allows you to reach people in need in your area, and also add information about other possible calls for help so other users can reach them too.\nTogether, we can create a better world!";
            sendTextMessage(userID, message);
        });
    }

    var messageData = {
        recipient: {
            id: userID
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: [{
                        title: "What do you want to do?",
                        subtitle: "You can either add new calls for help, or list near calls for help",
                        image_url: "https://cdn.pixabay.com/photo/2017/02/10/12/03/volunteer-2055010_960_720.png",
                        buttons: [{
                                type: "postback",
                                title: "Add a Call for Help",
                                payload: "NewEntry",
                            },
                            /*{
                                         type: "postback",
                                         title: "List Calls for Help",
                                         payload: "ListEntries",
                                       },*/
                            {
                                type: "postback",
                                title: "Find a Call for Help",
                                payload: "FindEntry",
                            }
                        ],
                    }]
                }
            }
        }
    };
    setTimeout(function() {
        callSendAPI(messageData);
    }, 1000);

    session.end(sessionObj);
}

function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText
        }
    };

    callSendAPI(messageData);
}

function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {
            access_token: process.env.PAGE_ACCESS_TOKEN
        },
        method: 'POST',
        json: messageData

    }, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            console.log("Successfully sent a message with id %s to recipient %s",
                messageId, recipientId);
        } else {
            console.error("Unable to send message.");
            console.log(recipientId);
            console.log(messageData);
            //console.error(response);
            //console.error(error);
        }
    });
}

function getDateTime() {

    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    var year = date.getFullYear();

    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day = date.getDate();
    day = (day < 10 ? "0" : "") + day;

    return year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec;
}



app.listen((process.env.PORT || 5000), function() {
    console.log("Server Started on Port %d", (process.env.PORT || 5000));
});