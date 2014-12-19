String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var ChatPanel = React.createClass({

    componentDidMount: function () {

        var $messages = $('.messagescontainer');

        $messages.height($(document).height() - 136);
        //  $messages.perfectScrollbar();
        $(window).on("resize.chat", function () {
            $messages.height($(window).height() - 136);
            //    $messages.perfectScrollbar("update");
        });

        // set up dropdown
        $('.dropdown-toggle').dropdown();
    },

    componentWillUnmount: function () {
        $(window).off("resize.chat");
    },

    getInitialState: function () {
        return {showJustChat: false};
    },

    toggleChatsClick: function () {
        var current = this.state.showJustChat;
        this.setState({showJustChat: !current});

        eventbus.trigger("update-scrollbars");

    },

    handleKeyDown: function (e) {
        if (e.keyCode == 13) {

            var $chatText = $('#chatText');
            eventbus.trigger("send-chat", $chatText.val());
            $chatText.val("");
        }
    },

    clickEditRoom: function () {
        eventbus.trigger("edit-room");
    },

    clickLinkInChat: function (e) {
        var url = $(e.currentTarget).data("url");
        eventbus.trigger("open-url", url);
    },

    findURIExpression: /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?Â«Â»ââââ]))/ig,

    linkify: function (text) {
        var split = text.split(this.findURIExpression);
        var result = [];
        for (var i = 0; i < split.length; ++i) {
            if (split[i] !== undefined) {
                if (i + 1 < split.length && split[i + 1] === undefined) {
                    var url = split[i];
                    // add in missing http://
                    if (url.indexOf(":") == -1) {
                        url = "http://" + url;
                    }
                    // only use select protocols
                    var protocol = url.split(":")[0];
                    if (_.contains(["http", "https", "spotify"], protocol)) {

                        if(url.endsWith(".gif") || url.endsWith(".png") || url.endsWith(".jpg"))
                        {
                            result.push(<a href="javascript:void(0)" onClick={this.clickLinkInChat} data-url={url} target="_blank"
                                data-toggle="tooltip" data-placement="top" data-original-title={'<img src="'+url+'" style="width:180px; height:auto;" />'} data-html="true" >{split[i]}</a>);
                        }
                        else {
                            result.push(<a href="javascript:void(0)" onClick={this.clickLinkInChat} data-url={url} target="_blank">{split[i]}</a>);
                        }
                    }
                    else
                        result.push(split[i]);
                } else {
                    result.push(split[i]);
                }
            }
        }
        return result;
    },

    emojify: function (reactArray) {
        var result = [];
        reactArray.forEach(function (chunk) {
            if (typeof chunk === 'string') {
                chunk = chunk.replace(":)", ":grinning:");
                chunk = chunk.replace(":D", ":smiley:");
                chunk = chunk.replace(";)", ":wink:");
                chunk = chunk.replace(":|", ":neutral_face:");
                chunk = chunk.replace(":(", ":disappointed:");
                chunk = chunk.replace(";(", ":cry:");
                chunk = chunk.replace("(y)", ":thumbsup:");
                chunk = chunk.replace("(Y)", ":thumbsup:");
                chunk = chunk.replace(":-P", ":stuck_out_tongue:");
                chunk = chunk.replace(":-p", ":stuck_out_tongue:");

                var split = chunk.split(new RegExp("<object[^>]*>.*?<\/object>|<span[^>]*>.*?<\/span>|<(?:object|embed|svg|img|div|span|p|a)[^>]*>|(" + emojione.shortnameRegexp + ")", "gi"));

                for (var index = 0; index < split.length; index++) {
                    var shortname = split[index];
                    if ((shortname == undefined) || (shortname == '') || (!(shortname in emojione.emojioneList))) {
                        // if the shortname doesnt exist just push text
                        result.push(shortname);
                    }
                    else {
                        var unicode = emojione.emojioneList[shortname][emojione.emojioneList[shortname].length - 1].toUpperCase();

                        // depending on the settings, we'll either add the native unicode as the alt tag, otherwise the shortname
                        alt = (emojione.unicodeAlt) ? emojione.convert(unicode) : shortname;

                        if (emojione.sprites) {
                            replaceWith = <span className={'emojione-' + unicode} title={shortname}></span>;
                        }
                        else {
                            replaceWith = <img className="emojione" alt={ alt } src={emojione.imagePathPNG + unicode + '.png' + emojione.cacheBustParam}/>;
                        }

                        result.push(replaceWith);
                        index++;
                    }
                }
            }
            else {
                // not a string, probably a tag (e.g. link)
                result.push(chunk);
            }
        });
        return result;
    },

    clickVoteInChat: function (e){
        var trackId = $(e.currentTarget).data("track");
        eventbus.trigger("track-vote-id", trackId);
    },

    trackNameWithVoteSpan: function(voteTrack){
        // if the user hasn't voted for this track, show a tooltip

        var component = this;

        var text = voteTrack.name + " by " + (voteTrack.artists.map(function (a) {
                return a.name;
            }).join(", "));

        // find track in actual room (may have already played, and don't include playing track)
        var track = _.find(_.rest(this.props.tracks), function (t){ return t.id == voteTrack.id;});

        if(!track)
            return <span>{text}</span>;

        var hasVoted = _.filter(track.votes, function (v){ return v.id==component.props.user.id;}).length>0;

        if(hasVoted) {
            return <span>{text}</span>;
        }
        else {
            return <span className="vote-chat" data-toggle="tooltip" data-placement="top" data-original-title={'Vote for '+track.name} onClick={component.clickVoteInChat} data-track={track.id}>{text}</span>;
        }
    },

    render: function () {
        var index = 0;
        var component = this;

        var allMessages = [];

        for (var chatIndex = 0; chatIndex < this.props.chat.length; chatIndex++) {
            var msg = this.props.chat[chatIndex];
            var text = msg.message;
            var icon = <i/>, albumArt = null, expand = null;
            var timestamp = moment(msg.timestamp).from(soundbounceShared.serverNow());

            if (msg.type == "add" || msg.type == "vote") {

                if (component.state.showJustChat)
                    continue;
                var iconClasses = React.addons.classSet({
                    'text-success': true,
                    'pull-left': true,
                    'mdi-file-file-upload': msg.type == "vote",
                    'mdi-av-playlist-add': msg.type == "add",
                    'icon': true
                });

                albumArt = <img className="album-art" src={msg.track.img} />

                icon = <i className={iconClasses} style={{color: component.props.color}}></i>;

                var groupedMessages = [];
                groupedMessages.push(component.trackNameWithVoteSpan(msg.track));

                // group together whilst next vote / add is from same user, and is less than 240 seconds after
                while (chatIndex + 1 < this.props.chat.length
                && this.props.chat[chatIndex + 1].type == msg.type
                && this.props.chat[chatIndex + 1].user.id == msg.user.id
                && ((new Date(this.props.chat[chatIndex + 1].timestamp)).getTime() - (new Date(this.props.chat[chatIndex].timestamp)).getTime()) < 1000 * 240) {

                    chatIndex++;
                    var nextMsg = this.props.chat[chatIndex];
                    /*  var nextTxt = nextMsg.track.name + " by " + (nextMsg.track.artists.map(function (a) {
                     return a.name;
                     }).join(", "));*/

                    groupedMessages.push(component.trackNameWithVoteSpan(nextMsg.track));
                    timestamp = moment(nextMsg.timestamp).from(soundbounceShared.serverNow());
                }

                if (groupedMessages.length > 1) {
                        text = <p onClick={function (e){ $(e.currentTarget).parent().find('.messages-expand').slideToggle(); $(e.currentTarget).parent().find('.album-art').toggle(); }}>{nextMsg.type == "add" ? "Added " : "Voted for "}<a href="javascript:void(0)">{groupedMessages.length + " tracks..."}</a></p>;
                    //expand = <div className="messages-expand">{_.flatten(groupedMessages.map(function(m){return <p>{m}</p>;}))}</div>;
                    expand = <div className="messages-expand">{_.flatten(groupedMessages.map(function(m){return <p>{m}</p>;}))}</div>;
                    // albumArt = null;
                }
                else {
                    text = <p><span>{(msg.type == "add" ? "Added " : "Voted for ")}</span>{groupedMessages[0]}</p>;
                }


            }
            else {
                // chat message grouping
                text = component.linkify(text);
                text = component.emojify(text);

                var groupedMessages = [];
                groupedMessages.push(<p>{text}</p>);

                // group together whilst next chat is from same user, and is less than 10 seconds after
                while (chatIndex + 1 < this.props.chat.length
                && this.props.chat[chatIndex + 1].type == "chat"
                && this.props.chat[chatIndex + 1].user.id == msg.user.id
                && ((new Date(this.props.chat[chatIndex + 1].timestamp)).getTime() - (new Date(this.props.chat[chatIndex].timestamp)).getTime()) < 1000 * 30) {

                    chatIndex++;
                    var nextMsg = this.props.chat[chatIndex];
                    var nextTxt = component.linkify(nextMsg.message);
                    nextTxt = component.emojify(nextTxt);
                    groupedMessages.push(<p>{nextTxt}</p>);
                    timestamp = moment(nextMsg.timestamp).from(soundbounceShared.serverNow());
                }

                text = _.flatten(groupedMessages);

            }

            if (timestamp.indexOf("seconds") > -1)
                timestamp = "Just now";

            var classes = React.addons.classSet({
                'message': true,
                'info': msg.type != "chat"
            });

            allMessages.push(<li className={(component.props.user.id == msg.user.id ? "self " : "other ") + msg.type}   >

                <div className="avatar">
                    <img className="circle" src={msg.user.img} />
                </div>
                <div className="messages" title={msg.context ? "Sent during '" + msg.context.name + "' by " + msg.context.artists[0].name : ""}>
                        {albumArt} {icon}
                    {text}
                {expand}
                    <time>{msg.user.name} {timestamp == "" ? "" : "• "}
                        <span data-toggle="tooltip" data-placement="top" title="" data-original-title={msg.context ? '<img style="width:90px;height:90px;" src=' + msg.context.img + ' /><br/>' + msg.context.name + ' by ' + msg.context.artists[0].name : ''} data-html="true">{timestamp}</span>
                    </time>
                </div>
            </li>);

        }


        return (
            <div className="chat-panel">
                <div className="messagescontainer">
                    <ol className="discussion">

                    {allMessages}
                    </ol>
                </div>
                <div className="chat-input-area">
                    <input type="text" className="form-control has-success" id="chatText" placeholder="Send message to all listeners..." onKeyDown={this.handleKeyDown} maxLength="400" />
                    <div className="chat-icons">
                        <i className="chat-send mdi-communication-chat"></i>
                        <div className="dropdown">
                            <i className="settings mdi-action-settings dropdown-toggle" title="Settings" data-toggle="dropdown"></i>
                            <ul className="dropdown-menu dropup">
                                <li>
                                    <a href="javascript:void(0)" onClick={this.toggleChatsClick}>{component.state.showJustChat ? "Show music and chats" : "Show only chats"}</a>
                                    <a href="javascript:void(0)" onClick={this.clickEditRoom}>Edit room</a>
                                </li>

                            </ul>
                        </div>
                    </div>

                </div>
            </div>

        );

    }
});
