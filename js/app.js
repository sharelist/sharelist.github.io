function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

function Item(id, title) {
    this.title = title;
    this.id = id;
}

application = {
    con: null,
    url: null,
    playlistid: null,
    player: null,
    routes: null,
    current: null,
    currentIndex: -1,
    playerLoaded: false,

    queue: [],

    base: 'https://yt-playlist.firebaseio.com/',

    init: function () {

        this.loadPartials();
        this.setupRoutes();
        this.setupEvents();

        $.ajaxSetup({
            cache: false
        });

        var self = this
        this.url = new Url;

        // Hash change tracking
        if ("onhashchange" in window) { // event supported?
            window.onhashchange = function () {
                self.hashChanged(window.location.hash);
            }
        } else { // event not supported:
            var storedHash = window.location.hash;
            window.setInterval(function () {
                if (window.location.hash != storedHash) {
                    storedHash = window.location.hash;
                    self.hashChanged(storedHash);
                }
            }, 100);
        }
    },

    loadPartials: function () {
        $("div.partial").each(function () {
            var elem = $(this);
            var template = elem.attr('data-partial');
            $.get('partials/' + template, function (data, status, xhr) {
                elem.html(data);
            });
        });
    },

    setupRoutes: function () {
        function Route(regex, action) {
            this.regex = regex;
            this.action = action;

            this.check = function (url) {
                return url.match(this.regex);
            }
        }

        this.routes = {
            init: function () {
                this.array.push(new Route(/#join/, 'joinAction'));
                this.array.push(new Route(/#new/, 'newAction'));
                this.array.push(new Route(/#playlist-([\w+-]*)/, 'playlistAction'));
            },
            array: []
        };

        this.routes.init();
    },


    setupEvents: function () {
        var self = this;
        $("#new-playlist-trigger").on('click.ytplaylist', function () {
            self.newAction();
        });

        $("#new-playlist-id").keypress(function (e) {
            if (e.keyCode == 13) {
                self.newAction();
            }
        });

        $("#join-id").keypress(function (e) {
            if (e.keyCode == 13) {
                window.location = '#playlist-' + $(this).val();
            }
        });

        $("#join-trigger").on('click.ytplaylist', function (e) {
            window.location = '#playlist-' + $("#join-id").val();
        });
    },

    setupSearch: function () {
        var self = this;
        var searchInput = $("#search");

        function clearResults() {
            $("#search-results").html('');
        }

        $("#clear-results").on('click', function () {
            clearResults();
        });

        searchInput.keyup(function () {
            var searchValue = $(this).val();

            if (searchValue.length < 3) {
                clearResults();
                return;
            }

            if (!searchValue || searchValue == '') {
                clearResults();
                return;
            }

            var keyword = encodeURIComponent(searchValue);
            var yt_url = 'https://www.googleapis.com/youtube/v3/search?q=' + keyword + '&format=5&max-results=10&v=2&alt=json';
            yt_url += '&key=AIzaSyC1Z8X72HT-NJeqHnYA2hyNrUqK7eM7REw&part=snippet';

            $.ajax
            ({
                type: "GET",
                url: yt_url,
                dataType: "jsonp",
                success: function (response) {
                    clearResults();
                    if (response.items) {
                        $.each(response.items, function (j, data) {
                            var id = data.id.videoId;

                            for (var i = 0; i < self.queue.length; i++) {
                                if (id == self.queue[i].id) {
                                    return; // Ignore added videos
                                }
                            }

                            createResultEntry(data)
                        });
                    }
                    else {
                        $("#search-results").append('<li>No results</li>');
                    }
                }
            });
        });

        function getThumbnailByCode(code) {
            return '//img.youtube.com/vi/' + code + '/default.jpg';
        }

        function createResultEntry(data) {
            var video_id = data.id.videoId;
            var video_title = data.snippet.title;
            var video_image = getThumbnailByCode(video_id);
            var final = '<li class="result-item" data-id="' + video_id + '">' +
                "<div class=\"col-xs-4 search-result-image\"><img src=\"" + video_image + "\"></div></div>" +
                "<div class=\"col-xs-8 search-result-title\">" + video_title + "</div>" +
                "</li>";

            $("#search-results").append(final);
        }

        $("body").on("click", ".result-item:not(.item-added)", function () {
            $(this).addClass('item-added');
            var code = $(this).attr('data-id');
            var title = $(this).find('.search-result-title').text();
            if (code) {
                self.addToQueue(code, title);
            }
        });

        $('#shuffle').on('click', function (e) {
            var btn = e.target;
            $('#' + btn.id + ' i').addClass('fa-spin');
            self.queue = shuffle(self.queue);
            self.createPlaylistView();
            self.playFirstVideoInQueue();

            setTimeout(function (){
                $('#' + btn.id + ' i').removeClass('fa-spin');
            }, 3000);
        });

    },

    hashChanged: function (hash) {

        var routes = this.routes;

        for (var i = 0; i < routes.array.length; i++) {
            var route = routes.array[i];
            var check = route.check(hash)
            if (check) {
                //console.log('OK: ' + check);
                var action = route.action;
                //console.log(typeof this[action]);
                if (typeof this[action] === 'function') {
                    this[action](check);
                }
            }
        }

    },

    connect: function (ref) {
        ref = ref || '';
        this.con = new Firebase(this.base + ref);
        return this.con;
    },

    checkIfPlaylistExists: function (id, callback) {
        var con = this.connect('');

        con.child(id).once('value', function (snapshot) {
            callback(snapshot.val() !== null);
        })
    },

    createPlaylist: function (id) {
        this.playlistid = id;
        this.getPlaylistConn().push({data: 'create'});
    },

    newAction: function () {
        var self = this;
        var id = $("#new-playlist-id").val();

        if (!id || id == '') {
            this.notify('Enter wanted playlist name', 'danger');
            return;
        }
        this.hideNotify();
        id = slugify(id);

        this.checkIfPlaylistExists(id, function (exists) {
            //console.log(exists);
            if (exists) {
                self.notify('Name is taken!', 'danger');
            } else {
                self.createPlaylist(id);
                window.location = '#playlist-' + id;
            }
        });
    },

    playlistAction: function (data) {
        var id = data[1]
        var self = this;
        //console.log(id);
        this.checkIfPlaylistExists(id, function (exists) {
            if (exists) {
                self.loadPlaylist(id)
            } else {
                self.notify('Playlist doesn\'t exists', 'danger');
            }
        });

    },

    loadPlaylist: function (id) {
        if (typeof(Storage) !== "undefined") {
            localStorage.setItem("ytplaylist.lastPlaylistId", id);
        }

        var self = this;
        this.loadPage('playlist.html', function () {
            self.loadPartials();
            self.setupSearch();

            $("#playlist-id").html(id);
            self.playlistid = id;

            self.getPlaylistConn().on('child_added', self.handleChildAdded);

            var tag = document.createElement('script');
            tag.src = "//www.youtube.com/iframe_api?enablejsapi=1";
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        });
    },

    handleChildAdded: function (snapshot) {
        var message = snapshot.val();

        if (message.hasOwnProperty('id') && message.hasOwnProperty('action')) {
            if (message.action == application.actions.add && message.hasOwnProperty('title')) {
                application.addVideoToPlaylist(message.id, message.title);
            } else if (message.action == application.actions.remove) {
                application.removeVideoFromPlaylist(message.id);
            } else if (message.action == application.actions.moveDown) {
                application.moveVideoDownInPlaylist(message.id);
            } else if (message.action == application.actions.moveUp) {
                application.moveVideoUpInPlaylist(message.id);
            }

        }
    },

    createPlaylistView: function () {
        var parent = $("#playlist");
        var self = this;

        parent.html('');
        for (var i = 0; i < this.queue.length; i++) {
            var id = this.queue[i].id;
            var actions = $('<div/>').addClass('actions')
                .append('<div class="remove-item" data-id="' + id + '"><i class="fa fa-trash"></i></div>')
                .append('<div class="up-item" data-id="' + id + '"><i class="fa fa-arrow-up"></i></div>')
                .append('<div class="down-item" data-id="' + id + '"><i class="fa fa-arrow-down"></i></div>');


            var title = $('<div/>').addClass('item-title').addClass('col-xs-8').text(this.queue[i].title);


            $('<li/>').addClass('playlist-item')
                .attr({"data-id": id})
                .html('<div class="col-xs-4"><img src="//img.youtube.com/vi/' + id + '/default.jpg"></div>')
                .append(actions)
                .append(title)
                .appendTo(parent);
        }

        $('body').off('click.ytplaylist');
        $("body").on("click.ytplaylist", ".playlist-item:not(.current)", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var code = $(this).attr('data-id');

            self.playVideoByCode(code);
        });

        $("body").on("click.ytplaylist", ".playlist-item .remove-item", function (e) {
            e.preventDefault();
            e.stopPropagation();

            var code = $(this).attr('data-id');
            if (!confirm('Are you sure?')) {
                return;
            }
            self.removeFromQueue(code);
        });

        $("body").on("click.ytplaylist", ".playlist-item .up-item", function (e) {
            e.preventDefault();
            e.stopPropagation();

            var code = $(this).attr('data-id');
            self.moveUp(code);
        });

        $("body").on("click.ytplaylist", ".playlist-item .down-item", function (e) {
            e.preventDefault();
            e.stopPropagation();

            var code = $(this).attr('data-id');
            self.moveDown(code);
        });
    },

    addVideoToPlaylist: function (id, title) {
        var item = new Item(id, title)
        this.queue.push(item);
        this.createPlaylistView();
    },

    getPlaylistConn: function () {
        return this.con.child(this.playlistid);
    },

    addToQueue: function (id, title) {
        this.getPlaylistConn().push({id: id, title: title, action: this.actions.add});
        //return this.getPlaylistConn().push({id: data, action: this.actions.add});
    },

    removeFromQueue: function (code) {
        this.getPlaylistConn().push({id: code, action: this.actions.remove});
    },

    moveUp: function (code) {
        this.getPlaylistConn().push({id: code, action: this.actions.moveUp});
    },

    moveDown: function (code) {
        this.getPlaylistConn().push({id: code, action: this.actions.moveDown});
    },

    actions: {
        add: 1,
        remove: 2,
        moveUp: 3,
        moveDown: 4
    },

    random: function () {
        return Math.random().toString(36).substr(2, 9);
    },

    joinAction: function () {
        var id = $("#join-id").val();

        var self = this;

        if (!id) {
            this.notify('No playlist ID specified', 'danger');
            this.redirect('');
        } else {
            this.playlistid = id;
            this.connect();
            this.getPlaylistConn().once('value', function (snapshot) {
                var exists = (snapshot.val() !== null);
                if (exists) {
                    self.loadPlaylist(id);
                } else {
                    self.redirect('');
                    self.notify('playlist not found', 'danger');
                }
            });
        }
    },

    redirect: function (path) {
        window.location.hash = path;
    },

    hideNotify: function () {
        $("#notification").hide().html('');
    },

    notify: function (text, type) {
        this.hideNotify();
        $("#notification").html('<div class="alert alert-' + type + '">' + text + '</div>');
        $("#notification").fadeIn();
    },

    loadPage: function (page, callback) {
        this.hideNotify();
        $.ajax({
            url: page,
            dataType: 'HTML'
        }).done(function (data) {
            $("#main").html("");
            $("#main").append(data);

            if (callback) {
                callback()
            }

        });
    },

    isPlaying: function () {
        if (!this.player || typeof(this.player.getPlayerState) != 'function') {
            return false;
        }

        var state = this.player.getPlayerState();
        return state == YT.PlayerState.PLAYING;
    },

    getIndexOf: function (key) {

        for (var i = 0; i < this.queue.length; i++) {
            if (this.queue[i].id == key) {
                return i;
            }
        }
    },

    switchPlaces: function (index1, index2) {
        var temp = this.queue[index1];
        this.queue[index1] = this.queue[index2];
        this.queue[index2] = temp;
    },

    moveVideoUpInPlaylist: function (key) {
        var index = this.getIndexOf(key);
        if (index < this.queue.length && index >= 1) {
            this.switchPlaces(index, index - 1);
        }
        this.createPlaylistView();
    },

    moveVideoDownInPlaylist: function (key) {
        var index = this.getIndexOf(key);
        if (index >= 0 && index < this.queue.length - 1) {
            this.switchPlaces(index, index + 1);
        }
        this.createPlaylistView();
    },

    removeVideoFromPlaylist: function (key) {
        var index = this.getIndexOf(key);
        if (index > -1) {
            this.queue.splice(index, 1);
        }
        this.createPlaylistView();
    },

    playVideoByCode: function (code) {
        if (this.isPlaying()) {
            this.player.stopVideo();
        }

        this.player.loadVideoById(code);
        this.player.playVideo();

        $('.playlist-item.current').removeClass('current');
        //get curr song title
        var song_title = $('.playlist-item[data-id="' + code + '"] .item-title').text();
        $('#song-name').text(song_title);

        var currentPlaylistItem = $('.playlist-item[data-id="' + code + '"]');
        currentPlaylistItem.addClass('current');

        // Scroll to current item
        $("#playlist-container").animate({scrollTop: $("#playlist-container").scrollTop() + currentPlaylistItem.offset().top}, {
            duration: 'medium',
            easing: 'swing'
        });

        this.current = code;
        this.currentIndex = this.getIndexOf(this.current);

    },

    playNextVideoInQueue: function () {
        if (this.queue.length > 0) {

            var nextIndex = this.currentIndex + 1;
            if (this.queue.length == nextIndex) { // Is this last video?
                nextIndex = 0;
            }
            var cur = this.queue[nextIndex];
            this.playVideoByCode(cur.id);
        }
    },

    playFirstVideoInQueue: function () {
        if (this.queue.length > 0) {
            var first = this.queue[0];
            this.playVideoByCode(first.id);
        }
    }
};

$(function () {
    application.init();
    var lastid = localStorage.getItem("ytplaylist.lastPlaylistId");
    if (lastid) {
        $("#last-playlist-id").html('<a href="#playlist-' + lastid + '">' + lastid + '</a>');
    }

    application.hashChanged(window.location.hash);
});


function youtube_parser(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    if (match && match[7].length == 11) {
        return match[7];
    } else {
        return null;
    }
}

function onYouTubeIframeAPIReady() {
    application.player = new YT.Player('player-container', {
        height: '390',
        width: '640',
        video: null,
        playerVars: {
            wmode: "opaque"
        },
        events: {
            'onReady': function () {
                application.playNextVideoInQueue();
                application.playerLoaded = true;

            },
            'onStateChange': function (event) {
                if (event.data == YT.PlayerState.ENDED && application.queue.length > 0) {
                    //application.removeFromQueue(application.current);
                    application.playNextVideoInQueue();
                }
            }
        }
    });
}

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    while (0 !== currentIndex) {

        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}


//sticky footer
$(window).bind("load", function () {
    var footer = $(".footer");
    var pos = footer.position();
    var height = $(window).height();
    height = height - pos.top;
    height = height - footer.height();
    if (height > 0) {
        footer.css({
            'margin-top': height + 'px',
            'bottom': 10 + 'px'
        });
    }
});