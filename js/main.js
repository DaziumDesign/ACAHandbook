var appConfig = {};

appConfig.turnJsSettings = {
	acceleration: true
};

appConfig.viewport = {
	gap: [40, 40],
	content: {
		'width': 'device-width',
		'initial-scale': '1',
		'maximum-scale': '2'
	}
};

appConfig.dimensions = {
	mattePadding: 29,
	page: [500, 666],
	pageMargins: [32, 35],
	pageMarginLeaniency: 1.7 // percentage that we will allow page contents to enter Y margin 
};

//the first one will be default, ordered by lowest priority when conditions are met
appConfig.modes = { 
	full: {
		maxW: (appConfig.dimensions.page[0]*2) +appConfig.dimensions.mattePadding,
		noIPhone: true
	},
	single: {
		bookDouble: false,
		maxW: (appConfig.dimensions.page[0]*2) + (appConfig.dimensions.mattePadding*2),
		noIPhone: true
	},
	scroll: {
		showBook: false,
		maxH: appConfig.dimensions.page[1],
		maxW: appConfig.dimensions.page[0] + (appConfig.dimensions.mattePadding*2)
	}
};

acaBookApp = (function($, window, appConfig, undefined){
	var $win = $(window),
		$body = $('body'),
		winD = {
			h: $win.height(),
			w: $win.width()
		},

		setWinD = function(){
			winD = {
				h: $win.height(),
				w: $win.width()
			};
		},

		resizeHandler = {
			funcs: [],

			onResize: function(){
				setWinD();
				$.each(this.funcs, function(i, funcInfo){
					if(typeof(funcInfo) == 'undefined')
						return;
					funcInfo.f.call(funcInfo.context);
				});

			},

			addFunc: function(id, f, context, priority){
				var newFunc = {
					id: id,
					f: f,
					context: context,
					priority: priority===undefined ? 10 : priority
				};

				arrSpot = 0;
				while(this.funcs[arrSpot]!==undefined && this.funcs[arrSpot].priority <= priority)
					arrSpot++;

				this.funcs.splice(arrSpot, 0, newFunc);
			},

			removeFunc: function(id){
				var rHandler = this;
				$.each(this.funcs, function(i, el){
					if(el.id == id){
						rHandler.funcs.splice(i, 1);
						return false;
					}
				});
			}
		},

		app = {
			$whiteout: $('#whiteout'),
			$app: $('<div />').attr('id', 'app-wrap').appendTo($body),
			$bookwrap: $('#book-wrap'),
			$bookmatte: $('#book-matte'),
			$book: $('#book'),
			$toc: $('#toc'),
			$tocWrap: $('#toc .wrap'),
			$tocToggle: $('#toc-toggle'),
			$tabs: $('#side-tabs'),
			$scroll: false,

			targetLookup: {},
			modes: [],
			curViewer: false,
			curMode: false,
			scrollCurPage: 1,

			init: function(config){
				var app = this;

				app.isPad = ( navigator.userAgent.match(/(iPad)/g) ? true : false );
				app.isPhone = ( navigator.userAgent.match(/(iPhone|iPod)/g) ? true : false );

				if(app.isPad)
					app.$app.addClass('iOS');


				//setup whiteout
				app.$whiteout.css({
					width: winD.w,
					height: winD.h
				});
				app.$bookwrap.show();


				// TOC bindings
				app.$toc.prependTo(app.$app);
				app.$tocToggle.prependTo(app.$app).show();

				app.$tocToggle.on('click', function(){
					app.tocToggle.call(app);
				});

				app.$toc.find('span.close, li').on('click', function(){
					app.tocToggle.call(app);
				});

				app.config = config;

				$.each(config.modes, function(id, settings){
					app.modes.push(new Mode(id, settings, app));
				});

				// bind resize funcs
				$win.resize(function(){ resizeHandler.onResize.call(resizeHandler) });

				app.$app.on('click', 'li[data-target], span[data-target], a[data-target]', function(e){
					app.gotoPage.call(app, $(e.currentTarget).data('target'));
				});

				// auto-paginate divs that need it
				app.autoPaginate();

				// clone book contents into scroll for later
				// (since it gets modified by turn.js)
				app.$scroll = app.$book.clone(false).attr('id', 'scroll');
				app.$scroll.children().each(function(i, el){
					$(el).addClass('p'+(i+1));
				});

				// build targetLookup directory
				$('[data-target]').each(function(i, el){
					var target = el.attributes['data-target'].value,
						$el;

					if(app.targetLookup[target] !== undefined)
						return;

					$el = $(target);
					if(!$el.hasClass('page'))
						$el = $el.parents('.page');

					app.targetLookup[target] = $el.index() + 1;
				});


				// add to resizeFuncs
				resizeHandler.addFunc('appWrap', app.appWrapSize, app, 1);
				resizeHandler.addFunc('viewportScale', app.viewportScale, app, 2);
				resizeHandler.addFunc('appSetMode', app.setMode, app, 3);
				resizeHandler.addFunc('tocSize', app.tocSize, app, 4);

				// initialize more dimensions
				app.config.dimensions.book = [0, app.config.dimensions.page[1]];
				app.config.dimensions.matte = [0, app.config.dimensions.page[1] + (appConfig.dimensions.mattePadding * 2)];
				app.config.dimensions.wrap = [0, app.config.dimensions.matte[1]];

			},

			tocToggle: function(){
				app.$tocToggle.toggle();
				app.$toc.toggle();
			},

			tocSize: function(){
				this.$toc.height(winD.h);
				this.$tocWrap.height(winD.h);
			},

			go: function(){
				var app = this;
				$win.resize();

				app.$whiteout.fadeOut(500, function(){
					app.$whiteout.remove();
				});
			},

			appWrapSize: function(){
				this.$app.css({
					width: winD.w,
					height: winD.h
				});

			},

			autoPaginate: function(){
				var app = this;

				app.$book.find('.page[data-auto-pagination]').each(function(i, el){
					var $pgAuto = $(el),
						$children = $pgAuto.children(),
						classes,
						pageNum = 0,
						$newPageTemplate = $('<div />'),
						$newPage,
						breakHeight,
						curHeight = 0,
						numberFormat = $pgAuto.attr('data-number-format');

					classes = $pgAuto.attr('class').split(' ');
					$.each(classes, function(j, c){
						if(c.search(/^pg-[0-9]/) == -1)
							return

						pageNum = c.substring(3);
						return false;
					});

					$newPageTemplate.attr('class', classes.join(' ')).removeClass('pg-'+pageNum);

					breakHeight = app.config.dimensions.page[1] - (app.config.dimensions.pageMargins[1] * app.config.dimensions.pageMarginLeaniency);

					$children.each(function(j, child){
						var $child = $(child),
							cMargin,
							cHeight,
							formattedPageNum;

						cHeight = $child.outerHeight(true);
						cMargin = cHeight - $child.outerHeight(false);

						if(curHeight + cHeight - cMargin > breakHeight || $child.hasClass('page-break')){
							$newPage.appendTo($pgAuto);

							pageNum++;
							curHeight = 0;
						}

						if(curHeight===0){
							if(numberFormat=='roman')
								formattedPageNum = app.util.romanize(pageNum);
							else
								formattedPageNum = pageNum;

							$newPage = $newPageTemplate.clone().addClass('pg-' + formattedPageNum)
											.append('<div style="height: ' + app.config.dimensions.pageMargins[1] + 'px"></div>');
						}

						curHeight += cHeight;
						$child.appendTo($newPage);

					});

					$pgAuto.children().unwrap();

				});
			},


			setMode: function(){
				var	app = this,
					newMode = app.modes[0],
					dim = app.config.dimensions;

				$.each(app.modes, function(i, mode){
					if(mode.isShowable())
						newMode = mode;
				});

				if(!app.curMode || app.curMode.id != newMode.id){

					// book or scroll?
					if(newMode.settings.showBook){

						// maybe initialize flipbook
						if(!app.$book.turn('is')){
							app.$book.turn(app.config.turnJsSettings);
						}

						// size dat book
						if(newMode.settings.bookDouble){
							dim.book[0] = dim.page[0] * 2;
							app.$book.turn('display', 'double');
							app.$app.removeClass('single').addClass('double');
						}else{
							dim.book[0] = dim.page[0];
							app.$book.turn('display', 'single');
							app.$app.removeClass('double').addClass('single');
						}
						app.$book.turn('size', dim.book[0], dim.book[1]);

						dim.matte[0] = dim.book[0];
						dim.wrap[0] = dim.book[0] + dim.mattePadding;

						app.$bookmatte.width(dim.matte[0]);
						app.$bookwrap.width(dim.wrap[0]);

						
						if(app.curViewer != 'book'){
							// hide scroller
							app.$scroll.detach();

							// resize binding
							resizeHandler.addFunc('viewportScale', app.viewportScale, app, 5);
							resizeHandler.addFunc('centerVertically', app.centerVertically, app, 10);

							// key bindings
							$win.on('keydown.book', function(e){
								if (e.target && e.target.tagName.toLowerCase()!='input')
									if (e.keyCode==37)
										app.$book.turn('previous');
									else if (e.keyCode==39)
										app.$book.turn('next');
							});

							app.$app.addClass('book').removeClass('scroll');


							// kill book event listeners
							$win.off('scroll.book');

							// attach book
							app.$bookwrap.appendTo(app.$app);

							// scale and center it
							app.centerVertically.call(app);

							//hash stuff
							app.$book.on('turned', function(event, page, view){
								hash.add({page: page});
							});

							if(hash.get('page') !== undefined)
								app.$book.turn('page', hash.get('page'));
							
							
						}

						app.curViewer = 'book';

					}else{

						if(app.curViewer != 'scroll'){
							// hide book
							app.$bookwrap.detach();

							// kill resize binding
							resizeHandler.removeFunc('viewportScale');
							resizeHandler.removeFunc('centerVertically');

							// kill book event listeners
							$win.off('keydown.book');
							app.$book.off('end')

							app.$app.addClass('scroll').removeClass('book');

							// attach scroll
							app.$scroll.appendTo(app.$app);

							// hash stuff
							var curWaiting = false,
								dest = 0;

							if(hash.get('page') !== undefined){
								dest = $('.p'+hash.get('page')).position().top;
								app.scrollCurPage = hash.get('page');
							}


							app.$app.animate({
								scrollTop: dest
							}, 500, function(){
								app.$app.on('scroll.book', function(event){
									if(!curWaiting){
										curWaiting = true;
										setTimeout(function(){
											var curTestTop = $('.p'+ app.scrollCurPage).position().top

											while( curTestTop + app.config.dimensions.page[1] < 0){
												app.scrollCurPage++;
												curTestTop = $('.p'+ app.scrollCurPage).position().top;
											}

											while( curTestTop > 0){
												app.scrollCurPage--;
												curTestTop = $('.p'+ app.scrollCurPage).position().top;
											}

											hash.add({page: app.scrollCurPage});

											curWaiting = false;
										}, 250);
									}
								});
							});

							

						}

						app.curViewer = 'scroll';
					}


					app.curMode = newMode;
				}

			},

			// handles 'data-target' stuff.
			gotoPage: function(req){
				var app = this;

				if(app.curViewer == 'book'){
					app.$book.turn('page', app.targetLookup[req]);
				}else{
					//alert($('.p'+app.targetLookup[req]).position().top);
					app.$app.animate({
						scrollTop: '+=' + $('.p'+app.targetLookup[req]).position().top
					}, 500);
				}
			},

			centerVertically: function(){
				var adjuster;

				if(this.config.viewport.content['width'] == 'device-width')
					adjuster = this.config.viewport.content['initial-scale'];
				else
					adjuster = (winD.w/this.config.viewport.content['width']);

				this.$bookwrap.css('padding-top', Math.floor((((winD.h/2) - this.config.dimensions.wrap[1]/2))/ adjuster ));
			},

			viewportScale: function(){
				var isPortrait = winD.h > winD.w,
					newContent = '',
					hDiff = winD.h - this.config.dimensions.page[1],
					wDiff = winD.w - this.config.dimensions.page[0];

				if(!this.isPad)
					return;

				if(isPortrait){
					this.config.viewport.content['width'] = this.config.dimensions.page[0] + (this.config.dimensions.mattePadding*2); //Math.floor((winD.w / this.config.dimensions.page[0]) * 10) / 10;
				}else if(!isPortrait){
					this.config.viewport.content['width'] = (this.config.dimensions.page[0]*2) + (this.config.dimensions.mattePadding*2);
				}

				if(this.config.viewport.content['width'] > winD.w){
					this.config.viewport.content['initial-scale'] = Math.floor(winD.w / this.config.viewport.content['width'] * 10) / 10;
					this.config.viewport.content['width'] = 'device-width';
				}


				// alert(this.config.viewport.content['initial-scale'] + ' ' + winD.w );

				//update meta tag
				$.each(this.config.viewport.content, function(i, el){
					if(el!==false)
						newContent += i + '=' + el + ', ';
				});
				if(newContent.length>0)
					newContent = newContent.substring(0, newContent.length-2);

				$('meta[name="viewport"]').attr('content', newContent);

				setWinD();
			}
		},


		Mode = function(id, settings, app){
			this.app = app;
			this.id = id;

			this.settings = {
				showBook: true,
				bookDouble: true,
				noIPhone: false,
				maxW: false,
				maxH: false
			};

			$.extend(this.settings, settings);
		};

	Mode.prototype.isShowable = function(){
		return	!(this.settings.noIPhone && this.app.isPhone)
				&& (
					(this.settings.maxW!==false && this.settings.maxW > winD.w) ||
					(this.settings.maxH!==false && this.settings.maxH > winD.h)
				)
	};


	app.util = {
		romanize: function(num) {
			if (!+num)
				return false;
			var digits = String(+num).split(''),
				key = ['','C','CC','CCC','CD','D','DC','DCC','DCCC','CM',
					   '','X','XX','XXX','XL','L','LX','LXX','LXXX','XC',
					   '','I','II','III','IV','V','VI','VII','VIII','IX'],
				roman = '',
				i = 3;
			while (i--)
				roman = (key[+digits.pop() + (i * 10)] || '') + roman;
			return Array(+digits.join('') + 1).join('M') + roman;
		}
	};


	app.init(appConfig);

	return app;



})(jQuery, window, appConfig);
