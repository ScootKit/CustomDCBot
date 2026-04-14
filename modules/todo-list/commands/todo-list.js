const {localize} = require('../../../src/functions/localize');

module.exports.autoComplete = {
    "add": {
        "priority": async (interaction) => {
            value = interaction.value.toLowerCase();

            interaction.respond(possibleValues);
        }
    },
    "delete": {
        "task": async (interaction) => {
            value = interaction.value.toLowerCase();

            interaction.respond(possibleValues);
        }
    }
};

module.exports.config = {
    name: "todo",
    description: localize("todo-list", "command-todo"),
    usage: "/todo",
    type: "slash",
    dafualtPermission: false,
    options: [
        {
            type: "SUB_COMMAND",
            name: "add",
            description: localize("todo-list", "command-todo-add"),
            options: [
                {
                    type: "STRING",
                    name: "name",
                    description: localize("todo-list", "command-todo-add_name"),
                    required: true,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "description",
                    description: localize("todo-list", "command-todo-add_description"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "due",
                    description: localize("todo-list", "command-todo-add_due"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "reminder",
                    description: localize("todo-list", "command-todo-add_reminder"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "priority",
                    description: localize("todo-list", "command-todo-add_priority"),
                    required: false,
                    autocomplete: true
                }
            ]
        },
        {
            type: "SUB_COMMAND_GROUP",
            name: "clear",
            description: localize("todo-list", "command-todo-clear"),
            options: [
                {
                    type: "SUB_COMMAND",
                    name: "all",
                    description: localize("todo-list", "command-todo-clear-all")
                },
                {
                    type: "SUB_COMMAND",
                    name: "done",
                    description: localize("todo-list", "command-todo-clear-done")
                }
            ]
        },
        {
            type: "SUB_COMMAND",
            name: "delete",
            description: localize("todo-list", "command-todo-delete"),
            options: [
                {
                    type: "STRING",
                    name: "task",
                    description: localize("todo-list", "command-todo-delete_task"),
                    required: true,
                    autocomplete: true
                }
            ]
        },
        {
            type: "SUB_COMMAND",
            name: "done",
            description: localize("todo-list", "command-todo-done"),
            options: [
                {
                    type: "STRING",
                    name: "task",
                    description: localize("todo-list", "command-todo-done_task"),
                    required: true,
                    autocomplete: true
                }
            ]
        },
        {
            type: "SUB_COMMAND",
            name: "edit",
            description: localize("todo-list", "command-todo-edit"),
            options: [
                {
                    type: "STRING",
                    name: "task",
                    description: localize("todo-list", "command-todo-edit_task"),
                    required: true,
                    autocomplete: true
                },
                {
                    type: "STRING",
                    name: "new-name",
                    description: localize("todo-list", "command-todo-edit_new-name"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "new-description",
                    description: localize("todo-list", "command-todo-edit_new-description"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "new-due",
                    description: localize("todo-list", "command-todo-edit_new-due"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "new-reminder",
                    description: localize("todo-list", "command-todo-edit_new-reminder"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "new-priority",
                    description: localize("todo-list", "command-todo-edit_new-priority"),
                    required: false,
                    autocomplete: true
                }
            ]
        },
        {
            type: "SUB_COMMAND",
            name: "list",
            description: localize("todo-list", "command-todo-list"),
            options: [
                {
                    type: "STRING",
                    name: "task",
                    description: localize("todo-list", "command-todo-list_task"),
                    required: false,
                    autocomplete: true
                },
                {
                    type: "STRING",
                    name: "description",
                    description: localize("todo-list", "command-todo-list_description"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "due",
                    description: localize("todo-list", "command-todo-list_due"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "reminder",
                    description: localize("todo-list", "command-todo-list_reminder"),
                    required: false,
                    autocomplete: false
                },
                {
                    type: "STRING",
                    name: "priority",
                    description: localize("todo-list", "command-todo-list_priority"),
                    required: false,
                    autocomplete: true
                },
                {
                    type: "STRING",
                    name: "status",
                    description: localize("todo-list", "command-todo-list_status"),
                    required: false,
                    autocomplete: true
                }
            ]
        },
        {
            type: "SUB_COMMAND",
            name: "view",
            description: localize("todo-list", "command-todo-view"),
            options: [
                {
                    type: "STRING",
                    name: "task",
                    description: localize("todo-list", "command-todo-view_task"),
                    required: true,
                    autocomplete: true
                }
            ]
        }
    ]
};