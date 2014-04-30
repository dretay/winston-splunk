define(function (require) {
    var async = require('async');
    var iocviewer = require('iocviewer');
    var highlighter = require('highlighter');
    var View = require('uac/views/View');
    var TableView = require('uac/views/TableView');
    var CollapsableContentView = require('uac/views/CollapsableContentView');
    var TableViewControls = require('uac/views/TableViewControls');

    var SuppressionFormView = require('sf/views/SuppressionFormView');
    var AcquireFormView = require('sf/views/AcquireFormView');
    var MassTagFormView = require('sf/views/MassTagFormView');
    var SuppressionsTableView = require('sf/views/SuppressionsTableView');
    var AcquisitionsTableView = require('sf/views/AcquisitionsTableView');
    var MD5ModelView = require('sf/views/MD5ModalView');

    var AcquisitionCollection = require('sf/models/AcquisitionCollection');
    var IOCCollection = require('sf/models/IOCCollection');
    var AgentHostModel = require('sf/models/AgentHostModel');
    var AuditModel = require('sf/models/AuditModel');
    var SuppressionModel = require('sf/models/SuppressionModel');
    var TagCollection = require('sf/models/TagCollection');
    var SetTagModel = require('sf/models/SetTagModel');
    var CommentsCollection = require('sf/models/CommentsCollection');
    var CommentsModel = require('sf/models/CommentsModel');

    var uac_utils = require('uac/common/utils');
    var sf_utils = require('sf/common/utils');

    var templates = require('sf/ejs/templates');

    /**
     * View to display a link to the current hit.
     */
    var HitsLinkView = View.extend({
        initialize: function (options) {
            this.options = options;
            if (options.table) {
                this.listenTo(options.table, 'click', this.render);
            }
        },
        render: function (data) {
            var view = this;

            view.close();

            var link = _.sprintf('%s//%s%s/sf/hits/identity/%s', window.location.protocol,
                window.location.hostname, (window.location.port ? ':' + window.location.port : ''), data.identity);
            var html = uac_utils.run_template(templates, 'link.ejs', {
                link: link,
                label: 'Link to Hit'
            });

            view.$el.popover({
                html: true,
                trigger: 'click',
                content: html
            })
                .data('bs.popover')
                .tip()
                .addClass('link-popover');

            view.$el.on('shown.bs.popover', function () {
                $('.link-text').select();
            });
        },
        close: function () {
            this.$el.popover('destroy');
            // Manually removing the popover due to -> https://github.com/twbs/bootstrap/issues/10335
            this.$el.parent().find('.popover').remove();
        }
    });

    /**
     * View for rendering a selectable list of tags values.
     */
    var TagView = View.extend({
        initialize: function (options) {
            this.options = options;
            if (this.model) {
                // Re-draw the tags view whenever the model is reloaded.
                this.listenTo(this.model, 'sync', this.render);
            }
        },
        events: {
            'click .dropdown-menu > li > a': 'on_click'
        },
        render: function () {
            var view = this;

            var disabled = view.options.disabled === true;
            var tagname = view.model.get('tagname');
            var selected_value = undefined;

            // Get the drop down menu.
            var menu = view.$('.dropdown-menu');
            // Remove any child elements.
            menu.empty();

            view.collection.each(function (item) {
                var item_name = item.get('name');
                var item_title = item.get('title');

                if (tagname && tagname == item_name) {
                    // Save off the value to display.
                    selected_value = item_title;

                    if (!disabled) {
                        menu.append(_.sprintf('<li><a name="%s" title="%s">%s &#10004;</a></li>',
                            item_name, item_name, item_title));
                    }
                }
                else if (!disabled) {
                    menu.append(_.sprintf('<li><a name="%s" title="%s">%s</a></li>',
                        item_name, item_name, item_title));
                }
            });

            if (selected_value) {
                view.$('.selected').html(selected_value);
            }

            if (disabled) {
                // Disable the tag component.
                view.$el.find('button').prop('disabled', true);
            }
        },
        on_click: function (ev) {
            var view = this;

            view.block();

            var tagname = $(ev.currentTarget).attr('name');
            var uuid = view.model.get('uuid');

            console.log(_.sprintf('Setting tag: %s on rowitem_uuid: %s', tagname, uuid));

            var tag_model = new SetTagModel({
                rowitem_uuid: uuid,
                tagname: tagname
            });
            tag_model.save({}, {
                async: false,
                success: function () {
                    try {
                        view.trigger('create', uuid, tagname);
                        console.log(_.sprintf('Applied tag: %s to rowitem_uuid: %s', tagname, uuid));
                        view.display_success('Successfully applied tag: ' + tagname);
                    }
                    finally {
                        view.unblock();
                    }
                },
                error: function () {
                    view.unblock();
                    view.display_error('Error while applying tag.');
                }
            });
        }
    });

    var IdentitiesView = View.extend({
        initialize: function(options) {
            this.options = options;
            if (this.model) {
                // Re-draw the view whenever the model is reloaded.
                this.listenTo(this.model, 'sync', this.render);
            }
        },
        events: {
            'click .dropdown-menu > li > a': 'on_click'
        },
        render: function() {
            var view = this;

            // Get the drop down menu.
            var menu = view.$('.dropdown-menu');
            // Remove any child elements.
            menu.empty();

            var uuid = view.model.get('uuid');
            var identical_hits = view.model.get('identical_hits');
            var selected = undefined;

            // Debug
            console.log('Found ' + identical_hits.length + ' identical hits for row: ' + uuid);

            if (identical_hits.length == 0) {
                view.$el.find('button').prop('disabled', true);

                view.$('.selected').html(view.get_title(view.model.get('created'), null, true, false, false));
            } else if (identical_hits.length == 1) {
                view.$el.find('button').prop('disabled', true);

                var hit = identical_hits[0];
                view.$('.selected').html(view.get_title(hit.created, null, true, false, false));
            } else {
                view.$el.find('button').prop('disabled', false);

                _.each(identical_hits, function(hit, index) {
                    if (uuid == hit.uuid) {
                        // This is the item being displayed, don't put it in the list.  Update the title instead.
                        view.$('.selected').html(view.get_title(hit.created, null, index == 0, false, true));

                        menu.append(_.sprintf('<li><a name="%s">%s</a></li>',
                            hit.uuid, view.get_title(hit.created, hit.tagtitle, index == 0, true, false)));
                    } else {
                        // Item is not the one being render, add to the list of selections.
                        menu.append(_.sprintf('<li><a name="%s">%s</a></li>',
                            hit.uuid, view.get_title(hit.created, hit.tagtitle, index == 0, false, false)));
                    }
                });
            }

            return view;
        },
        /**
         * Create a common title string for the menu items.
         * @param created - the row created date.
         * @param tag - the tagname value.
         * @param is_current - if the item is the latest.
         * @param is_caret - whether to include a caret in the output.
         * @returns {string} - the title string.
         */
        get_title: function(created, tag, is_current, is_selected, is_caret) {
            var selected_string = is_selected ? '&#10004;' : '';
            var target_string = is_current ? '&#42;' : '';
            var caret_string = is_caret ? ' <span class="caret"></span>' : '';
            var tag_string = tag ? ' - ' + tag : '';
            return _.sprintf('%s %s %s %s %s', uac_utils.format_date_string(created), tag_string, target_string, selected_string, caret_string);
        },
        on_click: function(ev) {
            var view = this;
            // Get the selected uuid.
            var selected_uuid = $(ev.currentTarget).attr('name');

            if (selected_uuid != view.model.get('uuid')) {
                // Debug
                console.log('Selected identity: ' + selected_uuid);
                // Trigger an event that the row uuid was selected.
                view.trigger('click', selected_uuid);
            }
        }
    });

    /**
     * View for displaying the merge button and handling the related actions.
     */
    var MergeView = View.extend({
        initialize: function(options) {
            this.options = options;
            if (this.model) {
                // Re-draw the view whenever the model is reloaded.
                this.listenTo(this.model, 'sync', this.render);
            }
        },
        events: {
            'click': 'on_click'
        },
        render: function() {
            var view = this;

            var current_uuid = view.model.get('uuid');
            var identical_hits = view.model.get('identical_hits');

            // Enable the merge option when there are more than one identical hits and the currently selected identity
            // is not the target of the merge operation.
            if (identical_hits && identical_hits.length > 1 && current_uuid != identical_hits[0].uuid) {
                view.$el.prop('disabled', false);
                view.$el.show();
            } else {
                view.$el.prop('disabled', true);
                view.$el.hide();
            }
        },
        /**
         * Handle the click of the merge button.
         * @param ev - the click event.
         */
        on_click: function(ev) {
            var view = this;
            view.block();

            // Merge the current identity into the current.
            var uuid = view.model.get('uuid');
            var merge_model = new Backbone.Model();
            merge_model.url = '/sf/api/hits/' + uuid + '/merge';
            merge_model.save({}, {
                success: function(model, response) {
                    try {
                        console.log('Merged ' + uuid + ' into ' + response.uuid);

                        view.display_success('Successfully merged identities.');

                        // Notify that a merge has taken place.
                        view.trigger('merge', uuid, response.uuid);
                    } finally {
                        view.unblock();
                    }
                },
                error: function() {
                    // Error.
                    view.unblock();
                    view.display_error('Error while performing merge.');
                }
            });
        }
    });

    var MergeAllView = View.extend({
        initialize: function(options) {
            this.options = options;
            if (this.model) {
                this.listenTo(this.model, 'sync', this.render);
            }
        },
        events: {
            'click': 'on_click'
        },
        render: function() {
            var view = this;

            var current_uuid = view.model.get('uuid');
            var identical_hits = view.model.get('identical_hits');

            if (identical_hits && identical_hits.length == 1) {
                // There is only a single identity.
                view.$el.prop('disabled', true);
                view.$el.show();
            } else {
                // There are multiple identities.
                if (current_uuid == identical_hits[0].uuid) {
                    // The current identity is the most recent, enable merge all.
                    view.$el.prop('disabled', false);
                    view.$el.show();
                } else {
                    // The current identity is not the most recent.
                    view.$el.prop('disabled', true);
                    view.$el.hide();
                }
            }
        },
        /**
         * Handle the click of the merge all button.
         * @param ev - the click event.
         */
        on_click: function(ev) {
            var view = this;
            var uuid = view.model.get('uuid');
            var merge_model = new Backbone.Model();
            merge_model.url = '/sf/api/hits/' + uuid + '/mergeall';

            view.block();
            merge_model.save({}, {
                success: function(model, response) {
                    try {
                        console.log(_.sprintf('Merged all identities for uuid: %s', uuid));
                        view.display_success('Successfully merged all identities.');

                        // Notify that a merge has taken place.
                        view.trigger('mergeall', uuid, response.uuid);
                    } finally {
                        view.unblock();
                    }
                },
                error: function() {
                    // Error.
                    view.unblock();
                    view.display_error('Error while performing mergeall.');
                }
            });
        }
    });

    /**
     * Agent host view.
     */
    var AgentHostView = View.extend({
        initialize: function(options) {
            this.options = options;
            var am_cert_hash = options['am_cert_hash'];
            if (!this.model) {
                var attr = {};
                if (options && options.am_cert_hash) {
                    attr.hash = options.am_cert_hash;
                }
                this.model = new AgentHostModel(attr);
            }
            this.listenTo(this.model, 'sync', this.render);
        },
        render: function() {
            var view = this;
            if (view.model.get("hash")) {
                // Display the host template.
                view.apply_template(templates, 'agent-host.ejs', view.model.toJSON());
            } else {
                // The host was not found, display alternate message.
                var data = {
                    am_cert_hash: view.model.get('hash')
                };
                view.apply_template(templates, 'agent-host-empty.ejs', data);
            }

            return view;
        },
        render_service_down: function() {
            var view = this;
            view.apply_template(templates, 'agent-host-error.ejs', {
                am_cert_hash: view.model.id
            });
        },
        fetch: function(am_cert_hash) {
            var view = this;
            view.model.clear();
            if (am_cert_hash) {
                view.model.set('hash', am_cert_hash);
            }

            view.block_element(view.$el);

            view.model.fetch({
                error: function() {
                    view.render_service_down();
                }
            });
        },
        attributes: function() {
            return this.model ? this.model.attributes : null;
        }
    });

    /**
     * View for displaying context menu in the audit view.
     */
    var AuditContextMenuView = View.extend({
        initialize: function(options) {
            this.options = options;
            this.render();
        },
        events: {
            "click #suppress-item": "suppress",
            "click #auto-suppress-item": "auto_suppress",
            "click #acquire-item": "acquire",
            "click #tag-item": "tag",
            'click #close-item': 'cancel'
        },
        render: function() {
            var view = this;

            $(view.options.source).highlighter({
                selector: _.sprintf('#%s', view.el.id),
                complete: function(selection, el) {

                    // TODO: Clean this up.

                    var child_elements;

                    // Try and get the element the user clicked on.
                    if (el && el.anchorNode && el.anchorNode.parentElement) {

                        var span = el.anchorNode.parentElement;
                        if (span && $(span).hasClass('ioc-term')) {
                            // The user clicked on an IOC term span.
                            var term1 = $(span).attr('ioc-term');
                            console.log('ioc-term: ' + term1);
                            view.ioc_term = term1;
                            view.$('#ioc-term-item').text(term1);
                            view.$('#auto-suppress-item').css('display', 'block');
                        } else if ((child_elements = $(el.anchorNode).find('.ioc-term')) && child_elements.length == 1) {
                            // The user clicked an IOC term.
                            var term2 = child_elements.attr('ioc-term');
                            console.log('ioc-term: ' + term2);
                            view.ioc_term = term2;
                            view.$('#ioc-term-item').text(term2);
                            view.$('#auto-suppress-item').css('display', 'block');
                        } else {
                            // Auto suppress is not available.
                            view.$('#auto-suppress-item').css('display', 'none');
                        }
                    } else {
                        // Auto suppress is not available.
                        view.$('#auto-suppress-item').css('display', 'none');
                    }

                    if (!_.isEmpty(selection)) {
                        selection = _.trim(selection);
                    }
                    view.selection = selection;
                }
            });

            var is_suppress = true;
            if ('suppress' in view.options && view.options['suppress'] === false) {
                is_suppress = false;
            }
            var is_acquire = true;
            if ('acquire' in view.options && view.options['acquire'] === false) {
                is_acquire = false;
            }
            var is_masstag = true;
            if ('masstag' in view.options && view.options['masstag'] === false) {
                is_masstag = false;
            }

            var data = {
                is_suppress: is_suppress,
                is_acquire: is_acquire,
                is_masstag: is_masstag
            };

            view.apply_template(templates, 'audit-context-menu.ejs', data);
        },
        suppress: function(ev) {
            this.trigger("suppress", this.selection, this.ioc_term);
            this.$el.hide();
        },
        auto_suppress: function(ev) {
            this.trigger("auto-suppress", this.selection, this.ioc_term);
            this.$el.hide();
        },
        acquire: function(ev) {
            this.trigger("acquire", this.selection);
            this.$el.hide();
        },
        tag: function(ev) {
            this.trigger('tag', this.selection, this.ioc_term);
            this.$el.hide();
        },
        cancel: function(ev) {
            this.$el.hide();
        }
    });

    /**
     * Audit content details view.
     */
    var AuditView = View.extend({
        initialize: function(options) {
            var view = this;
            view.options = options;
            if (view.model) {
                view.listenTo(view.model, 'sync', view.render);
            }
        },
        render: function() {
            var view = this;

            view.close();

            view.$el.html(view.model.get('content'));

            view.delegateEvents({
                'click .md5-view': 'on_click_md5'
            });

            this.collapse();

            return this;
        },
        on_click_md5: function(ev) {
            ev.preventDefault();

            if (this.md5_dialog) {
                this.md5_dialog.close();
            }
            this.md5_dialog = new MD5ModelView({
                model: new Backbone.Model($(ev.currentTarget).data().md5)
            });
            $('#dialog-div').append(this.md5_dialog.render().el);
            this.md5_dialog.modal()

            return false;
        },
        close: function() {
            this.undelegateEvents();
        }
    });

    /**
     * Tabbed view of IOC's.
     */
    var IOCTabsView = View.extend({
        initialize: function(options) {
            var view = this;
            view.options = options;
            if (!view.collection) {
                view.collection = new IOCCollection([], {
                    rowitem_uuid: options.rowitem_uuid
                });
            }

            // Filter by default.
            view.filtered = true;

            //view.listenTo(view.collection, 'sync', this.render);
        },
        render: function() {
            var view = this;

            var data = {
                items: view.collection.toJSON(),
                get_active_class: function(index) {
                    if (index == 0) {
                        return "active";
                    } else {
                        return "";
                    }
                }
            };

            // Cleanup any existing components the view has created before rendering.
            view.close();

            view.apply_template(templates, 'ioc-tabs.ejs', data);

            // Run the IOC viewer on all the pre-formatted elements.
            view.$el.find("pre").iocViewer();

            view.delegateEvents({
                'click #ioc-filter-button': 'on_click',
                'shown.bs.tab a[data-toggle="tab"]': 'on_shown'
            });

            // Filter by default.
            view.filter();

            return this;
        },
        select_tab: function(exp_key) {
            var view = this;
            if (exp_key) {
                // Select the specified tab.
                view.$el.find('li > a[name="' + exp_key + '"]').tab('show');
            } else {
                // Select the first tab.
                view.$el.find('li > a').first().tab('show');
            }
        },
        /**
         * Filter the IOC viewer to only the relevant hits.
         */
        filter: function() {
            var view = this;

            view.$el.find('#ioc-filter-button').html('<i class="fa fa-expand"></i> Expand IOC');

            // Iterator over the related IOC models and adjust the corresponding tab.
            _.each(view.collection.models, function(model, index, list) {
                var ioc_tab_selector = '#ioc-tab-' + index;
                var ioc_tab_element = view.$el.find(ioc_tab_selector);

                // Hide the metadata.
                //ioc_tab_element.find('.ioc-metadata').hide();

                // Find the root IOC definition.
                var ioc_definition_list = ioc_tab_element.find('.ioc-definition');
                if (ioc_definition_list.length != 1) {
                    console.error('Unable to find IOC definition: ' + ioc_definition_list.length);
                    //console.dir(ioc_definition_list);
                }
                var ioc_definition_element = ioc_definition_list;
                ioc_definition_element.addClass('highlighted');

                // Hide the root IOC definitions children.
                ioc_definition_element.find('ul, li').hide();

                // Get the highlighted items from the IOC's model.
                var selected_id_string = model.get('details');
                var selected_ids;
                if (selected_id_string.indexOf(',') != -1) {
                    selected_ids = selected_id_string.split(',');
                } else {
                    selected_ids = [selected_id_string];
                }

                // Iterate over the IOC's selected items.
                _.each(selected_ids, function(selected_id) {
                    var selected_id_selector = '.ioc-guid-' + selected_id;
                    var selected_element = ioc_definition_element.find(selected_id_selector);
                    if (!selected_element) {
                        console.error('Unable to find selected element for selector: ' + selected_id_selector);
                    }

                    // Retrieve the full path of the element to the root.
                    var selected_element_path = view.get_path(selected_element.get(0), ioc_definition_element.get(0));
                    _.each(selected_element_path, function(selected_path_item) {
                        // Display the selected item.
                        view.$el.find(selected_path_item).show();
                        // Mark the item as highlighted so it's not hidden.
                        view.$el.find(selected_path_item).addClass('highlighted');
                    });

                    // Highlight the item.
                    selected_element.find('> span.ioc-rule')
                        .css({
                            'background': '#FFF79A',
                            'font-weight': 'bold',
                            color: '#33311e'
                        });
                });
            });

            $('#ioc-filter-button').val('Expand IOC');
        },
        /**
         * Remove any IOC filtering.
         */
        unfilter: function() {
            var view = this;

            view.$el.find('#ioc-filter-button').html('<i class="fa fa-compress"> Collapse IOC</i>');

            // Iterator over the related IOC models and adjust the corresponding tab.
            _.each(view.collection.models, function(model, index, list) {
                var ioc_tab_selector = '#ioc-tab-' + index;
                console.log('ioc_tab_selection: ' + ioc_tab_selector);
                var ioc_tab_element = view.$el.find(ioc_tab_selector);

                // Find the root IOC definition.
                var ioc_definition_list = ioc_tab_element.find('.ioc-definition');
                if (ioc_definition_list.length != 1) {
                    console.error('Unable to find IOC definition.');
                }
                // Display the children and remove any previous formatting.
                ioc_definition_list.find('*').show();
                //ioc_definition_list.find('*').removeClass('uac-opaque').removeClass('highlighted');
            });
        },
        /**
         * Handler for an IOC tab being selected.
         * @param ev - the related event.
         */
        on_shown: function(ev) {
            var view = this;
            var exp_key = ev.target.name;

            console.log('Selected IOC with exp_key: ' + exp_key);
            view.trigger('ioc:selected', exp_key);

            if (!_.has(view.suppressions_table_map, exp_key)) {
                // Initialize the suppressions table for the expression.

                console.log('Initializing suppressions table for exp_key: ' + exp_key);

                var suppressions_table = new SuppressionsTableView({
                    el: $(_.sprintf('#suppressions-list-%s', exp_key)),
                    condensed: true
                });

                view.listenTo(suppressions_table, 'delete', function() {
                    // Trigger a higher level event when a suppression has been deleted.
                    view.trigger('suppression:deleted');
                });

                view.suppressions_table_map[exp_key] = suppressions_table;

                suppressions_table.collection.exp_key = exp_key;
                suppressions_table.fetch();
            }
        },
        on_click: function() {
            var view = this;
            view.filtered = !view.filtered;
            if (view.filtered) {
                view.filter();
            } else {
                view.unfilter();
            }
        },
        /**
         * Get the path to the element from the parent.
         * @param element - the element whose path we are retrieving.
         * @param parent - find the path up to this element.
         * @returns {Array} of elements.
         */
        get_path: function(element, parent) {
            var view = this;
            var path = '';
            var results = [];
            for (; element != parent && element && element.nodeType == 1; element = element.parentNode) {
                var inner = view.$el.find(element).children().length == 0 ? view.$el.find(element).text() : '';
                results.push(element);
                var eleSelector = element.tagName.toLowerCase() +
                    ((inner.length > 0) ? ':contains(\'' + inner + '\')' : '');
                path = ' ' + eleSelector + path;
            }
            // Debug, print the path.
            //console.log('Path: ' + path);
            return results;
        },
        fetch: function(rowitem_uuid) {
            var view = this;
            if (rowitem_uuid) {
                view.collection.rowitem_uuid = rowitem_uuid;
            }

            view.block(view.$el);
            view.collection.fetch({
                success: function() {
                    view.unblock(view.$el);
                },
                error: function() {
                    view.unblock(view.$el);
                }
            });
        },
        close: function() {
            var view = this;

            // Clean up any of the existing tables and rows.
            if (view.suppressions_table_map) {
                console.log('Closing ' + Object.keys(view.suppressions_table_map).length + ' suppression tables...');
                _.each(_.values(view.suppressions_table_map), function(table) {
                    console.log('Cleaning up table: ' + table.el.id);
                    view.stopListening(table);
                    table.close();
                });
            }
            view.suppressions_table_map = {};

            // Remove the elements from the DOM.
            view.remove();
        }
    });

    var CommentsTableView = TableView.extend({
        initialize: function(options) {
            var view = this;

            if (!view.collection) {
                view.collection = new CommentsCollection();
            }
            view.listenTo(view.collection, 'sync', view.render);

            // Call the super initialize.
            view.constructor.__super__.initialize.apply(this, arguments);

            view.options.iDisplayLength = -1;
            view.options.aoColumns = [{
                sTitle: "Created",
                mData: "created",
                sWidth: "20%",
                bSortable: true
            }, {
                sTitle: "Comment",
                mData: "comment",
                sWidth: "60%",
                bSortable: true,
                sClass: 'wrap'
            }, {
                sTitle: "User",
                mData: "user_uuid",
                sWidth: "20%",
                bSortable: true
            }];
            view.options.aaSorting = [
                [0, "desc"]
            ];
            view.options.aoColumnDefs = [{
                mRender: function(data, type, row) {
                    return uac_utils.format_date_string(data);
                },
                aTargets: [0]
            }];
            view.options.oLanguage = {
                sEmptyTable: 'No comments have been entered'
            };

            view.listenTo(view, 'row:created', function(row) {
                view.escape_cell(row, 1);
            });

            view.options.iDisplayLength = 10;
            view.options.sDom = 'lftip';
        },
        /**
         * Load the comments based on the row item.
         * @param rowitem_uuid - the row item.
         */
        fetch: function(rowitem_uuid) {
            var view = this;

            if (rowitem_uuid) {
                this.collection.rowitem_uuid = rowitem_uuid;
            }
            uac_utils.block_element(view.$el);
            this.collection.fetch({
                success: function() {
                    uac_utils.unblock(view.$el);
                },
                error: function() {
                    uac_utils.unblock(view.$el);
                }
            });
        }
    });

    /**
     * View to display and create comments.
     */
    var CommentsView = View.extend({
        initialize: function(options) {
            var view = this;
            view.options = options;
            if (options.rowitem_uuid) {
                view.rowitem_uuid = options.rowitem_uuid;
            }

            view.comments_collapsable = new CollapsableContentView({
                el: view.el
            });

            view.comments_table = new CommentsTableView();
            view.$('#comments-table').append(view.comments_table.el);

            view.listenTo(view.comments_table, 'load', function() {
                var comments_count = view.comments_table.get_total_rows();
                view.comments_collapsable.set('title', _.sprintf('<i class="fa fa-comments"></i> Comments (%s)',
                    comments_count));
                if (comments_count == 0) {
                    // Collapse the comments if there are none.
                    view.comments_collapsable.collapse();
                } else {
                    view.comments_collapsable.expand();
                }
            });
        },
        events: {
            "click button": "add_comment",
            "keyup #comment": "on_keyup"
        },
        fetch: function(rowitem_uuid) {
            this.rowitem_uuid = rowitem_uuid;
            this.comments_table.fetch(this.rowitem_uuid);
        },
        hide: function() {
            // Hide the collapsable decorator.
            this.comments_collapsable.hide();
        },
        show: function() {
            // Show the collapsable decorator.
            this.comments_collapsable.show();
        },
        add_comment: function() {
            var view = this;
            var comment = view.$("#comment").val();
            if (!comment || comment.trim() == "") {
                log.warn('No comment value found.');
                return;
            }

            console.log("Creating comment for rowitem_uuid: " + view.rowitem_uuid);

            var new_comment = new CommentsModel({
                comment: comment,
                rowitem_uuid: view.rowitem_uuid
            });

            console.log('Comment rowitem_uuid: ' + new_comment.get('rowitem_uuid'));

            view.block_element(view.$el);
            new_comment.save([], {
                async: false,
                success: function(model, response, options) {
                    view.unblock(view.$el);

                    $("#comment").val("");
                    view.comments_table.fetch();
                },
                error: function(model, xhr) {
                    // Error
                    view.unblock(view.$el);
                    var details = xhr && xhr.responseText ? xhr.responseText : 'Response text not defined.';
                    view.display_error('Error while creating new comment. - ' + details);
                }
            });
        },
        on_keyup: function(ev) {
            if (ev.keyCode == '13') {
                this.add_comment();
            }
        }
    });

    /**
     * View to display the acquisitions list in a condensed format.
     */
    var AcquisitionsViewCondensed = View.extend({
        initialize: function (options) {
            var view = this;
            view.options = options;
            view.acquisitions = new AcquisitionCollection();

            view.acqusitions_table = new AcquisitionsTableView({
                el: view.el,
                collection: view.acquisitions,
                condensed: true
            });
        },
        fetch: function (identity) {
            if (!identity) {
                // Error
                console.error('Condensed acquisitions view requires an identity!');
            }

            var view = this;
            view.acquisitions.identity = identity;
            view.acqusitions_table.fetch();
        }
    });

    /**
     * Generic view that includes a hits table, the IOC view, file details, and comments.
     *
     * options:
     *      hits-table-view - the hits table to attach this view to.
     *      tag             - whether to display the tag view.
     *      suppress        - whether to display the suppression form.
     *      masstag         - whether to display the mass tag form.
     *      acquire         - whether to display the acquire form.
     * @type {*}
     */
    var HitsDetailsView = View.extend({
        initialize: function(options) {
            var view = this;
            view.options = options;

            if (!options.hits_table_view) {
                // Error, hits_table_view is required.
                throw new Error('"hits_table_view" parameter is empty.');
            }

            // Initialize the hits table.
            view.hits_table_view = options.hits_table_view;

            // Render the details when a hit is selected.
            view.listenTo(view.hits_table_view, 'click', view.render_details);

            // Hide all of the details views when the hits table is empty.
            view.listenTo(view.hits_table_view, 'empty', function() {
                // Hide all components with the details view class.
                $('.sf-details-view').fadeOut().hide();
            });

            // Create the link view for displaying hit url links.
            view.link_view = new HitsLinkView({
                el: '#link-button',
                table: view.hits_table_view
            });
        },
        /**
         * The user has selected a hit, render the details of that hit.
         * @param data - the hit data.
         */
        render_details: function(data) {
            var view = this;
            // Capture the current row on the view instance.
            view.row = data;

            console.log('Hits row selected: ' + JSON.stringify(data));

            view.run_once('init_details', function() {
                //
                // Initialize the details components.

                // Prev/next controls.
                view.prev_next_view = new TableViewControls({
                    el: '#prev-next-div',
                    table: view.hits_table_view,
                    paging: false
                });
                view.prev_next_view.render();

                // Agent host view.
                view.agenthost_view = new AgentHostView({
                    el: '#agent-host-div'
                });

                // IOC tabs view.
                view.iocs = new IOCCollection();
                view.ioc_tabs_view = new IOCTabsView({
                    collection: view.iocs
                });
                view.listenTo(view.ioc_tabs_view, 'ioc:selected', function(exp_key) {
                    // Update the hits details view expression key whenever an IOC tab is selected.
                    view.exp_key = exp_key;
                    console.log('Hits details view now associated with exp_key: ' + exp_key);
                });
                view.listenTo(view.ioc_tabs_view, 'suppression:deleted', function() {
                    // Reload the hits after a suppression has been deleted.  Attempt to select the same row that we are
                    // current positioned on.
                    view.hits_table_view.refresh({
                        name: 'uuid',
                        value: view.row.uuid
                    });
                });
                view.listenTo(view.iocs, 'sync', function() {
                    // Reload the tabs view.
                    $('#iocs-div').html(view.ioc_tabs_view.render().el);
                    // Select and IOC tab.
                    view.ioc_tabs_view.select_tab(view.default_exp_key);
                });

                // Audit view.
                view.audit = new AuditModel();
                view.audit_view = new AuditView({
                    el: $("#audit-div"),
                    model: view.audit
                });

                // Initialize the tag view from the audit data.
                var tagging_enabled = !'tag' in view.options || view.options.tag !== false;
                view.tags = new TagCollection();
                // Display the tags view unless explicitly disabled.
                view.tags_view = new TagView({
                    el: '#tags',
                    collection: view.tags,
                    model: view.audit,
                    disabled: !tagging_enabled
                });
                if (tagging_enabled) {
                    // Only listen to create events if tagging is enabled.
                    view.listenTo(view.tags_view, 'create', function(rowitem_uuid, tagname) {
                        // Reload the details view.
                        view.fetch(rowitem_uuid);
                        // We have tagged the Trigger an event when a new tag has been created.
                        view.trigger('create:tag', rowitem_uuid, tagname);
                    });
                }
                sf_utils.get_tags(function(err, tags) {
                    if (err) {
                        // Error.
                        view.display_error('Exception while loading tags: ' + err);
                    } else {
                        view.tags.reset(tags);
                    }
                });

                // Initialize the identities view.
                view.identities_view = new IdentitiesView({
                    el: '#identities',
                    model: view.audit
                });
                view.listenTo(view.identities_view, 'click', function(uuid_identity) {
                    view.fetch(uuid_identity);
                });

                // Merge all button view.
                view.merge_all_view = new MergeAllView({
                    el: '#merge-all',
                    model: view.audit
                });
                view.merge_all_view.listenTo(view.merge_all_view, 'mergeall', function(uuid) {

                });

                // Merge button view.
                view.merge_view = new MergeView({
                    el: '#merge',
                    model: view.audit
                });

                // Update the audit type on the view.
                view.listenTo(view.audit, 'sync', function() {
                    $('#audit-type').html(view.audit.get('rowitem_type'));

                    // Unblock all of the audit dependent views.
                    view.unblock($('.audit-content'));
                });

                /**
                 * Generic method for handling merge and mergeall.
                 * @param uuid - the destination uuid.
                 */
                function handle_merge(uuid) {
                    // A merge operation has taken place, reload the hits view.
                    if (view.row.uuid == uuid) {
                        // The currently selected row is the merge destination.  Reload the hits and re-select the same
                        // the target row item.
                        view.hits_table_view.refresh({
                            name: 'uuid',
                            value: uuid
                        });
                    } else {
                        // The currently selected row is not the destination and has been deleted as part of the merge
                        // operation.

                        console.log('The item being merged is being deleted...');

                        var next_data = view.hits_table_view.peek_next_data();
                        if (next_data) {
                            // Select the next row.
                            view.hits_table_view.refresh({
                                name: 'uuid',
                                value: next_data.uuid
                            });
                        } else {
                            var prev_data = view.hits_table_view.peek_prev_data();
                            if (prev_data) {
                                // Select the previous row.
                                view.hits_table_view.refresh({
                                    name: 'uuid',
                                    value: prev_data.uuid
                                })
                            } else {
                                // Try and select the first row if there is one.
                                view.hits_table_view.select_row(0);
                            }
                        }
                    }
                }

                view.listenTo(view.merge_view, 'merge', function(source_uuid, dest_uuid) {
                    handle_merge(dest_uuid);
                });
                view.listenTo(view.merge_all_view, 'mergeall', function(uuid) {
                    handle_merge(uuid);
                });

                // Suppression form.
                view.suppression_form_view = new SuppressionFormView({
                    el: $("#dialog-div")
                });
                view.listenTo(view.suppression_form_view, 'create', function(model) {
                    view.trigger('create:suppression', view.row, model);
                });

                // Acquire form.
                view.acquire_form_view = new AcquireFormView({
                    el: '#dialog-div'
                });
                view.listenTo(view.acquire_form_view, 'create', function(model) {
                    // After an acquisition the row tag should be investigating.
                    view.trigger('create:acquire', view.row, model);
                });

                // Mass tag form.
                view.mass_tag_form = new MassTagFormView({
                    el: '#dialog-div'
                });
                view.listenTo(view.mass_tag_form, 'create', function(model) {
                    view.trigger('create:masstag', view.row, model);
                });

                // Context menu.
                view.context_menu = new AuditContextMenuView({
                    el: $("#context-menu-div"),
                    source: "#audit-div",
                    suppress: view.options.suppress,
                    acquire: view.options.acquire,
                    masstag: view.options.masstag
                });
                view.listenTo(view.context_menu, 'suppress', function(selection, ioc_term) {
                    console.log(_.sprintf('Creating suppression for text: %s, rowitem_type: %s, and term: %s',
                        selection, data.rowitem_type, ioc_term));

                    var options = {
                        itemvalue: selection,
                        rowitem_type: view.row.rowitem_type,
                        exp_key: view.exp_key,
                        cluster_uuid: view.row.cluster_uuid,
                        iocs: view.iocs
                    };

                    if (ioc_term) {
                        options.itemkey = ioc_term;
                    }
                    // Display the suppression form.
                    view.suppression_form_view.render(options);
                });
                view.listenTo(view.context_menu, 'acquire', function(selection) {
                    var agent_host_data = view.agenthost_view.attributes();

                    // Use the cluster uuid from Seasick.
                    var ss_cluster_uuid = null;
                    if (agent_host_data && agent_host_data.cluster && agent_host_data.cluster.uuid) {
                        ss_cluster_uuid = agent_host_data.cluster.uuid;
                    }

                    if (ss_cluster_uuid) {
                        view.acquire_form_view.render({
                            identity: view.row.identity,
                            selection: selection,
                            am_cert_hash: view.row.am_cert_hash,
                            cluster_uuid: ss_cluster_uuid,
                            cluster_name: view.row.cluster_name,
                            rowitem_uuid: view.row.uuid
                        });
                    } else {
                        // Error
                        view.display_error('Unable to submit acquisition, check Seasick status.');
                    }
                });
                view.listenTo(view.context_menu, 'tag', function(selection, ioc_term) {
                    var agent_host_data = view.agenthost_view.attributes();
                    view.mass_tag_form.render({
                        itemvalue: selection,
                        itemkey: ioc_term,
                        exp_key: view.exp_key,
                        am_cert_hash: view.row.am_cert_hash,
                        cluster_uuid: view.row.cluster_uuid,
                        rowitem_uuid: view.row.rowitem_uuid,
                        rowitem_type: view.row.rowitem_type,
                        iocs: view.iocs
                    });
                });
                view.listenTo(view.context_menu, 'auto-suppress', function(selection, ioc_term) {
                    // Auto create a suppression.
                    var suppression_model = new SuppressionModel({
                        itemvalue: selection,
                        rowitem_type: view.row.rowitem_type,
                        exp_key: view.exp_key,
                        cluster_uuid: view.row.cluster_uuid,
                        comment: selection,
                        condition: 'is',
                        itemkey: ioc_term,
                        preservecase: false
                    });
                    // Validate the model before saving.
                    if (!suppression_model.isValid()) {
                        // Error
                        errors = view.model.validationError;
                        _.each(errors, function(error) {
                            view.display_error(error);
                        });
                    } else {
                        // Ok.
                        view.block();

                        suppression_model.save({}, {
                            success: function(model, response) {
                                // The task has been submitted for the suppression.
                                var submit_message = _.sprintf('Submitted task for suppression: %s',
                                    suppression_model.as_string());
                                view.display_success(submit_message);

                                // Try and wait for the task result.
                                sf_utils.wait_for_task(response.task_id, function(err, completed, response) {
                                    view.unblock();

                                    if (err) {
                                        // Error checking the task result.
                                        view.display_error(err);
                                    } else if (completed) {
                                        // The task was completed successfully.
                                        var msg = _.sprintf('Successfully suppressed %s hits for %s',
                                            response.result.summary, suppression_model.as_string());
                                        view.display_success(msg);

                                        // Notify that a suppression was created.
                                        view.trigger('create:suppression', view.row, suppression_model);
                                    } else {
                                        // The task did not complete and is running in the background.
                                        var task_message = _.sprintf('The task for suppression: %s is still running and ' +
                                            'its results can be viewed on the <a href="/sf/tasks">Task List</a>.',
                                            suppression_model.as_string());
                                        view.display_info(task_message);
                                    }
                                });
                            },
                            error: function(model, xhr) {
                                try {
                                    var message = xhr && xhr.responseText ? xhr.responseText : 'Response text not defined.';
                                    view.display_error('Error while submitting auto suppression task - ' + message);
                                } finally {
                                    view.unblock();
                                }
                            }
                        });
                    }
                });

                // Comments view.
                view.comments_view = new CommentsView({
                    el: '#comments-div'
                });

                // Acquisitions view.
                view.acquisitions_view = new AcquisitionsViewCondensed({
                    el: '#acquisitions-table'
                });
            });

            view.fetch();
        },
        fetch: function(rowitem_uuid) {
            var view = this;

            // Update the child views with the current row's parameters.

            var uuid;
            if (rowitem_uuid) {
                // A specific rowitem was specified.
                uuid = rowitem_uuid;
            } else {
                // A row item was not specified, use the current selected row.
                uuid = view.row.uuid;

                // Update the host data unless we are just changing to date within this identity.  Assumes that all row
                // item versions for this identity are for the same host.
                view.agenthost_view.fetch(view.row.am_cert_hash);

                // Update the acquisitions.
                view.acquisitions_view.fetch(view.row.identity);
            }

            // Fetch the related audit and update the audit view, tags view, and identity data.
            view.audit.set('id', uuid, {
                silent: true
            });

            // Block the entire audit pane including the menu options.
            view.block_element($('.audit-content'));

            view.audit.fetch();

            // Update the IOC.
            view.ioc_tabs_view.fetch(uuid);

            // Update the comments.
            view.comments_view.fetch(uuid);

            $('.sf-details-view').fadeIn().show();
        }
    });

    return HitsDetailsView;
});