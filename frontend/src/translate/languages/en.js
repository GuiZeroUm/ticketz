const messages = {
  en: {
    translations: {
      date: {
        yesterday: "Yesterday"
      },
      common: {
        search: "Search",
        filter: "Filter",
        edit: "Edit",
        delete: "Delete",
        cancel: "Cancel",
        save: "Save",
        confirm: "Confirm",
        confirmation: "Confirmation",
        areyousure: "Are you sure?",
        close: "Close",
        closed: "Closed",
        error: "Error",
        success: "Success",
        actions: "Actions",
        add: "Add",
        name: "Name",
        email: "Email",
        phone: "Phone",
        language: "Language",
        company: "Company",
        user: "User",
        users: "Users",
        connection: "Connection",
        connections: "Connections",
        queue: "Queue",
        queues: "Queues",
        contact: "Contact",
        messages: "Messages",
        whatsappNumber: "WhatsApp Number",
        dueDate: "Due Date",
        copy: "Copy",
        paste: "Paste",
        proceed: "Proceed",
        enabled: "Enabled",
        disabled: "Disabled",
        undefined: "Undefined",
        yes: "Yes",
        no: "No",
        noqueue: "No queue",
        rating: "Rating",
        transferTo: "Transfer to",
        key: "Key",
        value: "Value",
        validations: {
          required: "This field is required",
          short: "Value too short",
          long: "Value too long",
          invalid: "Invalid value",
          invalidEmail: "Invalid email",
          invalidPhone: "Invalid phone number"
        },
        serverTime: "Server time:",
        clientTime: "Client time:",
        differenceMinutes: "Difference: {{count}} minute(s)"
      },
      signup: {
        title: "Sign Up",
        toasts: {
          success: "User created successfully! Log in now!!!",
          fail: "Error creating user. Check the provided data."
        },
        form: {
          name: "Name",
          nickname: "Nickname",
          birthdayDay: "Day",
          birthdayMonth: "Month",
          email: "Email",
          password: "Password"
        },
        buttons: {
          submit: "Sign Up",
          login: "Already have an account? Log in!"
        }
      },
      login: {
        title: "Login",
        form: {
          email: "Email",
          password: "Password"
        },
        buttons: {
          submit: "Log In",
          register: "Don't have an account? Sign up!"
        }
      },
      companies: {
        title: "Register Company",
        form: {
          name: "Company Name",
          plan: "Plan",
          token: "Token",
          submit: "Register",
          success: "Company created successfully!"
        }
      },
      auth: {
        toasts: {
          success: "Login successful!"
        },
        token: "Token"
      },
      dashboard: {
        usersOnline: "Users online",
        ticketsWaiting: "Tickets waiting",
        ticketsOpen: "Open tickets",
        ticketsDone: "Resolved tickets",
        totalTickets: "Total tickets",
        newContacts: "New contacts",
        avgServiceTime: "Average service time",
        avgWaitTime: "Average wait time",
        ticketsOnPeriod: "Tickets in the period",
        userCurrentStatus: "Current status",
        filter: {
          period: "Period",
          custom: "Custom",
          last3days: "Last 3 days",
          last7days: "Last 7 days",
          last14days: "Last 14 days",
          last30days: "Last 30 days",
          last90days: "Last 90 days"
        },
        date: {
          start: "Start date",
          end: "End date"
        },
        ticketCountersLabels: {
          created: "Created",
          closed: "Closed"
        },
        blog: {
          title: "Espaço Whats Blog",
          loading: "Loading posts...",
          error: "Could not load blog posts right now.",
          empty: "No blog posts found.",
          showAll: "Show all posts",
          showLess: "Show less",
          openPost: "Read post",
          previous: "Previous post",
          next: "Next post"
        }
      },
      connections: {
        title: "Connections",
        toasts: {
          deleted: "WhatsApp connection successfully deleted!"
        },
        confirmationModal: {
          deleteTitle: "Delete",
          deleteMessage: "Are you sure? This action cannot be undone.",
          disconnectTitle: "Disconnect",
          disconnectMessage:
            "Are you sure? You will need to scan the QR Code again.",
          closeTickets: "Close all open tickets from this connection"
        },
        buttons: {
          add: "Add WhatsApp",
          disconnect: "Disconnect",
          tryAgain: "Try Again",
          qrcode: "QR CODE",
          newQr: "New QR CODE",
          connecting: "Connecting"
        },
        toolTips: {
          disconnected: {
            title: "Failed to initiate WhatsApp session",
            content:
              "Make sure your phone is connected to the internet and try again, or request a new QR Code."
          },
          qrcode: {
            title: "Waiting for QR Code scan",
            content:
              "Click the 'QR CODE' button and scan the QR Code with your phone to start the session."
          },
          connected: {
            title: "Connection established!"
          },
          timeout: {
            title: "Connection to the phone has been lost",
            content:
              "Make sure your phone is connected to the internet and WhatsApp is open, or click 'Disconnect' to get a new QR Code."
          },
          passkey: {
            title: "Passkey authentication required",
            content:
              "Click the passkey button and use the browser extension to capture the authenticated WhatsApp Web session."
          },
          refresh: "Refresh",
          disconnect: "Disconnect",
          scan: "Scan QR Code",
          newQr: "Request new QR Code",
          retry: "Try Again",
          resetPasskey: "Reset passkey session"
        },
        table: {
          name: "Name",
          status: "Status",
          lastUpdate: "Last Update",
          default: "Default",
          actions: "Actions",
          session: "Session"
        }
      },
      internalChat: {
        title: "Internal Chat"
      },
      whatsappModal: {
        title: {
          add: "Add WhatsApp",
          edit: "Edit WhatsApp"
        },
        form: {
          name: "Name",
          default: "Default"
        },
        buttons: {
          okAdd: "Add",
          okEdit: "Save",
          cancel: "Cancel"
        },
        success: "WhatsApp saved successfully."
      },
      qrCode: {
        message: "Scan the QR Code to start the session",
        extensionHint: "Authenticate through WhatsApp Web",
        startCapture: "Capture WhatsApp Web session",
        installExtension: "Install Capture Extension"
      },
      passkeyModal: {
        title: "Capture WhatsApp Web Extension",
        instructions:
          "Use the browser extension to capture the authenticated WhatsApp Web session and send it to the server.",
        connectorNotFound:
          "Extension not detected. Install the passkey capture extension and reload the page.",
        connectorReady:
          "Extension detected. Click below to authenticate through WhatsApp Web.",
        startCapture: "Start Capture",
        waitingForCapture: "Waiting for WhatsApp Web session capture…",
        existingSession: "WhatsApp Web already has a session for {{number}}.",
        captureExisting: "Capture this session",
        clearAndContinue: "Clear local session and continue",
        importSent: "Session captured and sent successfully.",
        importError: "Capture failed: {{reason}}.",
        missingToken: "Capture token is missing. Please reload the page.",
        downloadExtension: "Download capture extension",
        installInstructions: "How to install",
        hideInstructions: "Hide instructions",
        instructionsIntro: "Follow the steps below to install the extension:",
        installStep1: "Download the extension ZIP file.",
        installStep2: "Extract the ZIP file to a folder on your computer.",
        installStep3: "Open Google Chrome and go to chrome://extensions/.",
        installStep4:
          "Enable Developer mode using the toggle in the top-right corner.",
        installStep5: 'Click "Load unpacked".',
        installStep6:
          "Select the extracted folder containing the extension files.",
        installStep7: "The extension is now installed and ready to use.",
        installStep8: "Refresh this page with F5 and try to connect again."
      },
      contacts: {
        title: "Contacts",
        toasts: {
          deleted: "Contact successfully deleted!"
        },
        searchPlaceholder: "Search...",
        confirmationModal: {
          deleteTitle: "Delete ",
          importTitlte: "Import Contacts",
          deleteMessage:
            "Are you sure you want to delete this contact? All related interactions will be lost.",
          importMessage: "Do you want to import all contacts from the phone?"
        },
        buttons: {
          import: "Import Contacts",
          add: "Add Contact"
        },
        table: {
          name: "Name",
          whatsapp: "WhatsApp",
          email: "Email",
          actions: "Actions"
        }
      },
      contactModal: {
        title: {
          add: "Add Contact",
          edit: "Edit Contact"
        },
        form: {
          mainInfo: "Contact Information",
          extraInfo: "Additional Information",
          name: "Name",
          number: "WhatsApp Number",
          email: "Email",
          extraName: "Field Name",
          extraValue: "Value",
          disableBot: "Disable chatbot"
        },
        buttons: {
          addExtraInfo: "Add Information",
          okAdd: "Add",
          okEdit: "Save",
          cancel: "Cancel"
        },
        success: "Contact saved successfully."
      },
      queueModal: {
        title: {
          add: "Add Queue",
          edit: "Edit Queue"
        },
        form: {
          name: "Name",
          color: "Color",
          greetingMessage: "Greeting Message",
          complationMessage: "Completion Message",
          outOfHoursMessage: "Out of Hours Message",
          ratingMessage: "Rating Message",
          transferMessage: "Transfer Message",
          token: "Token"
        },
        tabs: {
          label: "Queue sections",
          data: "Queue Data",
          chatbot: "Chatbot",
          chatbotHint: "Save the queue before building the chatbot",
          schedules: "Business Hours"
        },
        toasts: {
          saved: "Queue saved successfully",
          deleted: "Attachment removed successfully"
        },
        confirmationModal: {
          deleteTitle: "Remove attachment",
          deleteMessage:
            "Are you sure you want to remove this queue's attachment? This action cannot be undone."
        },
        buttons: {
          okAdd: "Add",
          okEdit: "Save",
          cancel: "Cancel",
          attach: "Attach File"
        },
        serviceHours: {
          dayWeek: "Day of the week",
          startTimeA: "Start Time - Shift A",
          endTimeA: "End Time - Shift A",
          startTimeB: "Start Time - Shift B",
          endTimeB: "End Time - Shift B",
          monday: "Monday",
          tuesday: "Tuesday",
          wednesday: "Wednesday",
          thursday: "Thursday",
          friday: "Friday",
          saturday: "Saturday",
          sunday: "Sunday"
        }
      },
      userModal: {
        title: {
          add: "Add User",
          edit: "Edit User"
        },
        listItems: {
          adminProfile: "Administrator",
          userProfile: "User"
        },
        form: {
          name: "Name",
          email: "Email",
          password: "Password",
          profile: "Profile"
        },
        buttons: {
          okAdd: "Add",
          okEdit: "Save",
          cancel: "Cancel"
        },
        success: "User saved successfully."
      },
      scheduleModal: {
        title: {
          add: "New Schedule",
          edit: "Edit Schedule"
        },
        subtitle:
          "Define the audience and occasion, then personalize every delivery.",
        sections: {
          audience: "Audience",
          when: "When",
          message: "Message and variables",
          media: "Media",
          review: "Review"
        },
        form: {
          body: "Message",
          contact: "Contact",
          contacts: "Contacts",
          allContacts: "All eligible contacts",
          kind: "Schedule type",
          sendAt: "Scheduled Date",
          sendTime: "Annual time",
          timezone: "Time zone",
          commemorativeDate: "Commemorative date",
          sentAt: "Sent Date",
          saveMessage: "Save message in ticket",
          mediaMode: "Media delivery",
          noMedia: "No media selected"
        },
        kinds: {
          once: "One-time date",
          birthday: "Birthday",
          commemorative: "Commemorative date"
        },
        mediaModes: {
          caption: "Message as caption",
          separate: "Separate message and media"
        },
        review: {
          recipients: "recipients",
          missingData: "Some data is missing",
          hint: "Preview the message with a real contact before saving."
        },
        buttons: {
          okAdd: "Add",
          okEdit: "Save",
          cancel: "Cancel",
          save: "Save schedule",
          preview: "Generate preview",
          attach: "Add media",
          removeMedia: "Remove"
        },
        success: "Schedule saved successfully."
      },
      tagModal: {
        title: {
          add: "New Tag",
          edit: "Edit Tag",
          addKanban: "New Lane",
          editKanban: "Edit Lane"
        },
        form: {
          name: "Name",
          color: "Color",
          kanban: "Kanban"
        },
        buttons: {
          okAdd: "Add",
          okEdit: "Save",
          cancel: "Cancel"
        },
        success: "Tag saved successfully.",
        successKanban: "Lane saved successfully."
      },
      chat: {
        noTicketMessage: "Select a ticket to start the conversation."
      },
      uploads: {
        titles: {
          titleUploadMsgDragDrop: "DRAG AND DROP FILES IN THE FIELD BELOW",
          titleFileList: "List of file(s)"
        }
      },
      todolist: {
        title: "Tasks list",
        form: {
          name: "Task name"
        },
        buttons: {
          add: "Add",
          save: "Save"
        }
      },
      ticketsManager: {
        buttons: {
          newTicket: "New"
        }
      },
      ticketsQueueSelect: {
        placeholder: "Queues"
      },
      tickets: {
        toasts: {
          deleted: "The ticket you were working on has been deleted."
        },
        notification: {
          message: "Message from",
          nomessages: "No messages"
        },
        tabs: {
          open: { title: "Open" },
          closed: { title: "Closed" },
          groups: { title: "Groups" },
          search: { title: "Search" }
        },
        search: {
          placeholder: "Search for ticket and messages",
          filterByTags: "Filter by tags",
          filterByUsers: "Filter by users"
        },
        buttons: {
          showAll: "All"
        }
      },
      transferTicketModal: {
        title: "Transfer Ticket",
        fieldLabel: "Type to search for users",
        fieldQueueLabel: "Transfer to queue",
        fieldQueuePlaceholder: "Select a queue",
        noOptions: "No user found with that name",
        buttons: {
          ok: "Transfer",
          cancel: "Cancel"
        }
      },
      ticketsList: {
        pendingHeader: "Pending",
        assignedHeader: "Assigned",
        noTicketsTitle: "Nothing here!",
        noTicketsMessage: "No ticket found with this status or searched term",
        buttons: {
          accept: "Accept"
        }
      },
      newTicketModal: {
        title: "Create Ticket",
        fieldLabel: "Type to search for contact",
        add: "Add",
        buttons: {
          ok: "Save",
          cancel: "Cancel"
        }
      },
      mainDrawer: {
        listItems: {
          dashboard: "Dashboard",
          connections: "Connections",
          tickets: "Tickets",
          quickMessages: "Quick Responses",
          contacts: "Contacts",
          queues: "Queues & Chatbot",
          tags: "Tags",
          administration: "Administration",
          service: "Service",
          users: "Users",
          settings: "Settings",
          helps: "Help",
          chatgpt: "ChatGPT",
          schedules: "Schedules",
          campaigns: "Campaigns",
          annoucements: "Announcements",
          chats: "Internal Chat",
          financeiro: "Financial",
          logout: "Logout",
          management: "Management",
          kanban: "Kanban",
          tasks: "Tasks"
        },
        appBar: {
          i18n: {
            language: "English",
            language_short: "EN"
          },
          user: {
            profile: "Profile",
            subscriptionValidUntilLabel: "Subscription valid until",
            darkmode: "Dark mode",
            lightmode: "Light mode",
            language: "Select language",
            logout: "Logout"
          }
        }
      },
      chatgpt: {
        title: "ChatGPT",
        enabled: "Pilot enabled",
        disabled: "Pilot disabled",
        warningTitle: "Personal and clinical data",
        warning:
          "When connected, identifiable conversations and possible clinical data may be sent to ChatGPT based on your questions. Use only after legal and administrative approval.",
        copy: "Copy URL",
        connection: {
          title: "MCP server URL",
          description:
            "Espaço Whats does not use an OpenAI key. Intelligence and limits belong to the user's ChatGPT plan."
        },
        steps: {
          title: "How to connect",
          open: "Open ChatGPT Developer Mode",
          create: "Create a Draft MCP integration",
          url: "Paste the MCP URL",
          oauth: "Choose OAuth",
          login: "Sign in with the tenant, administrator email, and password"
        },
        connections: {
          title: "Active connections",
          empty: "No ChatGPT connection.",
          client: "Client",
          admin: "Administrator",
          created: "Created",
          lastUse: "Last used",
          revoke: "Revoke",
          revokeAll: "Revoke all"
        },
        revoke: {
          title: "Revoke connection",
          one: "This connection will lose access immediately.",
          all: "All connections for this tenant will lose access immediately."
        },
        toasts: { copied: "MCP URL copied.", revoked: "Connection revoked." }
      },
      notifications: {
        noTickets: "No notifications."
      },
      quickMessages: {
        title: "Quick Responses",
        buttons: {
          add: "New Response"
        },
        dialog: {
          shortcode: "Shortcut",
          message: "Response"
        }
      },
      kanban: {
        title: "Kanban",
        searchPlaceholder: "Search",
        subMenus: {
          list: "Panel",
          tags: "Lanes"
        }
      },
      tagsKanban: {
        title: "Lanes",
        laneDefault: "Open",
        confirmationModal: {
          deleteTitle: "Are you sure you want to delete this Lane?",
          deleteMessage: "This action cannot be undone."
        },
        table: {
          name: "Name",
          color: "Color",
          tickets: "Tickets",
          actions: "Actions"
        },
        buttons: {
          add: "New Lane"
        },
        toasts: {
          deleted: "Lane deleted successfully."
        }
      },
      contactLists: {
        title: "Contact Lists",
        table: {
          name: "Name",
          contacts: "Contacts",
          actions: "Actions"
        },
        buttons: {
          add: "New List"
        },
        dialog: {
          name: "Name",
          company: "Company",
          okEdit: "Edit",
          okAdd: "Add",
          add: "Add",
          edit: "Edit",
          cancel: "Cancel"
        },
        confirmationModal: {
          deleteTitle: "Delete",
          deleteMessage: "This action cannot be undone."
        },
        toasts: {
          deleted: "Record deleted",
          created: "Record created"
        }
      },
      contactListItems: {
        title: "Contacts",
        searchPlaceholder: "Search",
        buttons: {
          add: "New",
          lists: "Lists",
          import: "Import"
        },
        dialog: {
          name: "Name",
          number: "Number",
          whatsapp: "WhatsApp",
          email: "Email",
          okEdit: "Edit",
          okAdd: "Add",
          add: "Add",
          edit: "Edit",
          cancel: "Cancel"
        },
        table: {
          name: "Name",
          number: "Number",
          whatsapp: "WhatsApp",
          email: "Email",
          actions: "Actions"
        },
        confirmationModal: {
          deleteTitle: "Delete",
          deleteMessage: "This action cannot be undone.",
          importMessage:
            "Do you want to import the contacts from this spreadsheet? ",
          importTitlte: "Import"
        },
        toasts: {
          deleted: "Record deleted"
        }
      },
      campaigns: {
        title: "Campaigns",
        searchPlaceholder: "Search",
        buttons: {
          add: "New Campaign",
          contactLists: "Contact Lists"
        },
        table: {
          name: "Name",
          whatsapp: "Connection",
          contactList: "Contact List",
          status: "Status",
          scheduledAt: "Scheduled",
          completedAt: "Completed",
          confirmation: "Confirmation",
          actions: "Actions"
        },
        dialog: {
          new: "New Campaign",
          update: "Edit Campaign",
          readonly: "Read-only",
          form: {
            name: "Name",
            message1: "Message 1",
            message2: "Message 2",
            message3: "Message 3",
            message4: "Message 4",
            message5: "Message 5",
            confirmationMessage1: "Confirmation Message 1",
            confirmationMessage2: "Confirmation Message 2",
            confirmationMessage3: "Confirmation Message 3",
            confirmationMessage4: "Confirmation Message 4",
            confirmationMessage5: "Confirmation Message 5",
            messagePlaceholder: "Message content",
            whatsapp: "Connection",
            status: "Status",
            scheduledAt: "Scheduled",
            confirmation: "Confirmation",
            contactList: "Contact List"
          },
          buttons: {
            add: "Add",
            edit: "Update",
            okadd: "Ok",
            cancel: "Cancel Dispatches",
            restart: "Restart Dispatches",
            close: "Close",
            attach: "Attach File"
          }
        },
        confirmationModal: {
          deleteTitle: "Delete",
          deleteMessage: "This action cannot be undone."
        },
        toasts: {
          success: "Operation completed successfully",
          cancel: "Campaign canceled",
          restart: "Campaign restarted",
          deleted: "Record deleted"
        }
      },
      announcements: {
        title: "Announcements",
        searchPlaceholder: "Search",
        buttons: {
          add: "New Announcement",
          contactLists: "Announcement Lists"
        },
        table: {
          priority: "Priority",
          title: "Title",
          text: "Text",
          mediaName: "File",
          status: "Status",
          actions: "Actions"
        },
        dialog: {
          edit: "Announcement Edit",
          add: "New Announcement",
          update: "Edit Announcement",
          readonly: "Read-only",
          form: {
            priority: "Priority",
            title: "Title",
            text: "Text",
            mediaPath: "File",
            status: "Status"
          },
          buttons: {
            add: "Add",
            edit: "Update",
            okadd: "Ok",
            cancel: "Cancel",
            close: "Close",
            attach: "Attach File"
          }
        },
        confirmationModal: {
          deleteTitle: "Delete",
          deleteMessage: "This action cannot be undone."
        },
        toasts: {
          success: "Operation completed successfully",
          deleted: "Record deleted"
        }
      },
      campaignsConfig: {
        title: "Campaign Configurations",
        intervals: "Intervals",
        messageInterval: "Message Interval (seconds)",
        longerIntervalAfter: "Longer Interval After (messages)",
        longerInterval: "Longer Interval (seconds)",
        addVariable: "Add Variable"
      },
      queues: {
        title: "Queues & Chatbot",
        dragHint:
          "Drag queues by the handle to set the order they appear in the WhatsApp main menu.",
        empty: "No queues created yet.",
        noGreeting: "No greeting message",
        optionsCountHint: "Options in the chatbot main menu",
        moveHandle: "Move queue {{name}}",
        moved: "{{name}} moved to position {{position}} of {{total}}",
        table: {
          name: "Name",
          color: "Color",
          greeting: "Greeting Message",
          actions: "Actions"
        },
        toasts: {
          deleted: "Queue removed successfully"
        },
        buttons: {
          add: "Add Queue"
        },
        confirmationModal: {
          deleteTitle: "Delete",
          deleteMessage:
            "Are you sure? This action cannot be undone! The tickets from this queue will still exist but will no longer be assigned to any queue."
        }
      },
      chatbotFlow: {
        title: "Automated journey",
        subtitle: "This is how the customer sees the menu on WhatsApp",
        activeCount: "{{active}}/{{total}} active",
        path: "Chatbot path",
        root: "Main menu",
        footer:
          "Drag by the handle to reorder. The key the customer types is always 1, 2, 3… among the active options — deactivating one renumbers the rest automatically.",
        noTitle: "Untitled",
        noMessage: "No message",
        inactive: "Inactive — not shown in the menu",
        exitsChatbot: "Ends the chatbot and calls an agent",
        forwardsTo: "Forwards to {{queue}}",
        activeKey: "The customer types {{key}}",
        answers: "{{total}} answers",
        createAnswers: "Create answers",
        moveHandle: "Move option {{title}}",
        activate: "Activate {{title}}",
        deactivate: "Deactivate {{title}}",
        moved: "{{title}} moved to position {{position}} of {{total}}",
        emptyRoot:
          "No options yet. Create the first one and it becomes item 1 of the menu.",
        emptyBranch:
          "No answers for this option yet. The customer only gets its message.",
        addOption: "Add option",
        addAnswer: "Add answer",
        toasts: {
          saved: "Option saved successfully",
          deleted: "Option removed successfully"
        },
        confirmDelete: {
          title: "Delete option",
          message:
            "Are you sure? The answers inside it will also be deleted, and the following options will be renumbered."
        },
        editor: {
          addTitle: "New option",
          editTitle: "Edit option",
          title: "Title",
          titleHelp:
            "Shown next to the number in the menu sent to the customer.",
          message: "Message",
          messageHelp:
            "Sent when the customer picks this option. Leave blank to send only the following answers.",
          attach: "Attach file",
          removeAttachment: "Remove attachment",
          exitChatbot: "End the chatbot and call an agent",
          forwardQueue: "Forward to another queue",
          noForwardQueue: "Do not forward",
          forwardQueueHelp:
            "When this option is picked, the ticket moves to the selected queue and its menu is sent.",
          delete: "Delete",
          cancel: "Cancel",
          save: "Save"
        }
      },
      queueSelect: {
        inputLabel: "Queues"
      },
      users: {
        title: "Users",
        table: {
          name: "Name",
          email: "Email",
          profile: "Profile",
          actions: "Actions"
        },
        buttons: {
          add: "Add User"
        },
        toasts: {
          deleted: "User deleted successfully."
        },
        confirmationModal: {
          deleteTitle: "Delete",
          deleteMessage:
            "All user data will be lost. Open tickets from this user will be moved to the queue."
        }
      },
      helps: {
        title: "Help Center",
        empty: "No material published yet.",
        emptyGroup: "No content in this card.",
        noGroups: "No cards registered.",
        inactive: "Inactive",
        active: "Active",
        videos: "Videos",
        articles: "Articles",
        articleOne: "article",
        articleOther: "articles",
        videoOne: "video",
        videoOther: "videos",
        tabs: {
          contents: "Content",
          groups: "Groups"
        },
        audience: {
          company: "Customers",
          partner: "Partners"
        },
        scope: {
          platform: "Platform",
          company: "My company"
        },
        sections: {
          platform: "Platform help",
          company: "{{name}} help",
          companyFallback: "Your company"
        },
        player: {
          title: "Video"
        },
        contentType: {
          video: "Video",
          article: "Article"
        },
        buttons: {
          addGroup: "New card",
          addContent: "New content",
          cancel: "Cancel",
          save: "Save"
        },
        iconPicker: {
          title: "Choose icon",
          search: "Search icon"
        },
        groupModal: {
          addTitle: "New card",
          editTitle: "Edit card",
          title: "Title",
          subtitle: "Subtitle",
          audience: "Audience",
          isGlobal: "Publish to every company",
          isGlobalHelper:
            "Platform material: shows up in the Help Center of every company."
        },
        contentModal: {
          addTitle: "New content",
          editTitle: "Edit content",
          group: "Card",
          title: "Title",
          description: "Description",
          contentPlaceholder: "Write the article...",
          video: "YouTube video",
          videoHelper:
            "Paste the YouTube link or just the ID, e.g. dQw4w9WgXcQ",
          videoInvalid: "We could not find a YouTube video in this value.",
          videoPreview: "Video thumbnail preview",
          duration: "Duration",
          link: "Link",
          linkHelper: "Optional. Used when the video is not on YouTube."
        },
        confirmDeleteGroup: {
          title: "Delete card",
          message:
            "Do you really want to delete this card? All of its content will be removed."
        },
        confirmDeleteContent: {
          title: "Delete content",
          message: "Do you really want to delete this content?"
        },
        toasts: {
          saved: "Operation completed successfully!",
          deleted: "Record deleted successfully!"
        }
      },
      about: {
        aboutthe: "About the",
        copyright: "© 2024 - Powered by Espaço Whats",
        buttonclose: "Close",
        title: "About Espaço Whats",
        abouttitle: "Origin and improvements",
        aboutdetail:
          "Espaço Whats is indirectly derived from the Whaticket project with improvements shared by the developers of the EquipeChat system through the VemFazer channel on YouTube, later improved by Claudemir Todo Bom",
        aboutauthorsite: "Author's site",
        aboutwhaticketsite: "Whaticket Community site on Github",
        aboutvemfazersite: "Vem Fazer channel site on Github",
        licenseheading: "Open Source License",
        licensedetail:
          "Espaço Whats is licensed under the GNU Affero General Public License version 3, which means that any user who has access to this application has the right to obtain access to the source code. More information at the links below:",
        licensefulltext: "Full text of the license",
        licensesourcecode: "Espaço Whats source code"
      },
      schedules: {
        title: "Schedules",
        confirmationModal: {
          deleteTitle: "Are you sure you want to delete this Schedule?",
          deleteMessage: "This action cannot be undone."
        },
        table: {
          contact: "Contact",
          body: "Message",
          sendAt: "Scheduling Date",
          sentAt: "Sending Date",
          status: "Status",
          actions: "Actions",
          occasion: "Occasion",
          nextRun: "Next occurrence",
          audience: "Audience",
          progress: "Deliveries"
        },
        tabs: { schedules: "Schedules", dates: "Commemorative dates" },
        filters: { kind: "Type", status: "Status" },
        empty: "No schedules found.",
        emptyDeliveries: "Deliveries will appear here after the occurrence.",
        buttons: {
          add: "New Schedule"
        },
        toasts: {
          deleted: "Schedule deleted successfully."
        }
      },
      commemorativeDates: {
        add: "New commemorative date",
        edit: "Edit commemorative date",
        success: "Commemorative date saved successfully.",
        empty: "No commemorative dates have been added.",
        last: "Last",
        form: {
          name: "Name",
          ruleType: "Annual pattern",
          month: "Month",
          day: "Day",
          weekday: "Weekday",
          ordinal: "Occurrence",
          active: "Active"
        },
        rules: { fixed: "Fixed day and month", nthWeekday: "Weekday in month" },
        weekdays: {
          0: "Sunday",
          1: "Monday",
          2: "Tuesday",
          3: "Wednesday",
          4: "Thursday",
          5: "Friday",
          6: "Saturday"
        }
      },
      tags: {
        title: "Tags",
        confirmationModal: {
          deleteTitle: "Are you sure you want to delete this Tag?",
          deleteMessage: "This action cannot be undone."
        },
        table: {
          name: "Name",
          color: "Color",
          tickets: "Tickets",
          contacts: "Contacts",
          actions: "Actions",
          id: "Id",
          kanban: "Kanban"
        },
        buttons: {
          add: "New Tag"
        },
        toasts: {
          deleted: "Tag deleted successfully."
        }
      },
      whitelabel: {
        primaryColorLight: "Primary color light",
        primaryColorDark: "Primary color dark",
        lightLogo: "App logo light",
        darkLogo: "App logo dark",
        favicon: "App logo favicon",
        appname: "App name",
        logoHint: "Prefer SVG and aspect of 28:10",
        faviconHint: "Prefer square SVG image or 512x512 PNG",
        loginLinks: "Login links",
        loginLinksHint:
          "Add title and URL pairs to display below the login box on desktop and mobile.",
        linkTitle: "Link title",
        linkUrl: "Link URL",
        removeLink: "Remove link",
        sidePanelImage: "Login side panel image",
        sidePanelImageHint:
          "Displayed on the left side of the login form on desktop layouts.",
        backgroundContent: "Login background content",
        backgroundContentHint:
          "Supports images, SVG files, and MP4 videos for the login screen background.",
        linkPreview: "Link preview (sharing)",
        linkPreviewImage: "Link banner",
        linkPreviewImageHint:
          "Image shown when the system link is shared (WhatsApp, Telegram, etc.). Prefer 1200x630.",
        linkPreviewDescription: "Link description",
        linkPreviewDescriptionHint:
          "Text shown below the title in the shared link preview.",
        noFileSelected: "No file selected yet.",
        buildExtension: "Build WA Session Capture extension",
        buildingExtension: "Building extension…",
        downloadExtension: "Download extension",
        extensionHint:
          "Builds a whitelabeled Chrome extension. The downloaded ZIP already contains the extension files: extract it and load the extracted folder as an unpacked extension.",
        extensionBuildStarted:
          "Extension build started. You will be notified when it is ready.",
        extensionBuildFailed: "Could not start the extension build.",
        extensionBuilt: "Extension built successfully.",
        extensionBuildUnknownError: "Unknown build error."
      },
      settings: {
        group: {
          general: "General",
          timeouts: "Timeouts",
          officeHours: "Office Hours",
          groups: "Groups",
          confidenciality: "Confidentiality",
          api: "API",
          externalServices: "External Services",
          serveradmin: "Server Administration"
        },
        success: "Setting saved successfully.",
        copiedToClipboard: "Copied to clipboard",
        title: "Settings",
        chatbotTicketTimeout: "Chatbot ticket timeout (minutes)",
        chatbotTicketTimeoutAction: "Action after chatbot timeout",
        settings: {
          userCreation: {
            name: "User creation",
            options: {
              enabled: "Enabled",
              disabled: "Disabled"
            }
          }
        },
        validations: {
          title: "validations",
          options: {
            enabled: "enabled",
            disabled: "disabled"
          }
        },
        OfficeManagement: {
          title: "Office Management",
          options: {
            disabled: "disabled",
            ManagementByDepartment: "Management By Department",
            ManagementByCompany: "Management By Company"
          }
        },
        outOfHoursAction: {
          title: "Out of Hours Action",
          options: {
            pending: "Leave as pending",
            closed: "Close ticket"
          }
        },
        IgnoreGroupMessages: {
          title: "Ignore Group Messages",
          options: {
            enabled: "enabled",
            disabled: "disabled"
          }
        },
        soundGroupNotifications: {
          title: "Sound on Group Notifications",
          options: {
            enabled: "enabled",
            disabled: "disabled"
          }
        },
        groupsTab: {
          title: "Groups Tab",
          options: {
            enabled: "enabled",
            disabled: "disabled"
          }
        },
        VoiceAndVideoCalls: {
          title: "Voice and video calls",
          options: {
            enabled: "Ignore",
            disabled: "unavailability report"
          }
        },
        AutomaticChatbotOutput: {
          title: "Automatic Chatbot Output",
          options: {
            enabled: "enabled",
            disabled: "disabled"
          }
        },
        ShowNumericEmoticons: {
          title: "Display numeric emojis in the queue",
          options: {
            enabled: "enabled",
            disabled: "disabled"
          }
        },
        QuickMessages: {
          title: "Quick Messages",
          options: {
            enabled: "By company",
            disabled: "By User"
          }
        },
        AllowRegistration: {
          title: "Allow Registration",
          options: {
            enabled: "enabled",
            disabled: "disabled"
          }
        },
        FileUploadLimit: {
          title: "File Upload Limit (MB)"
        },
        FileDownloadLimit: {
          title: "File Download Limit (MB)"
        },
        messageVisibility: {
          title: "Message Visibility",
          options: {
            respectMessageQueue: "Respect queue of message",
            respectTicketQueue: "Respect queue of ticket"
          }
        },
        keepQueueAndUser: {
          title: "Keep queue and user on closed ticket",
          options: {
            enabled: "Enabled",
            disabled: "Disabled"
          }
        },
        GracePeriod: {
          title: "Subscription Grace Period (days)"
        },
        ticketAcceptedMessage: {
          title: "Ticket Accepted Message",
          placeholder: "Enter your ticket accepted message here"
        },
        transferMessage: {
          title: "Transfer Message",
          placeholder: "Enter your transfer message here"
        },
        mustacheVariables: {
          title: "Available variables:"
        },
        WelcomeGreeting: {
          greetings: "Hello",
          welcome: "Welcome to",
          expirationTime: "Active until"
        },
        Options: {
          title: "Options"
        },
        Companies: {
          title: "Companies"
        },
        schedules: {
          title: "schedules",
          updateToNewFormat: "Update to new format"
        },
        Plans: {
          title: "Plans",
          public: "Public",
          usersLimit: "Users limit",
          connectionsLimit: "Connections limit",
          queuesLimit: "Queues limit",
          currencyCode: "Currency code (ISO 4217)"
        },
        Help: {
          title: "Help"
        },
        Whitelabel: {
          title: "Whitelabel"
        },
        PaymentGateways: {
          title: "Pasarelas de pago"
        },
        i18nSettings: {
          title: "Translations"
        },
        AIProvider: {
          title: "AI Provider"
        },
        AudioTranscriptions: {
          title: "Audio Transcriptions"
        },
        TagsMode: {
          title: "Tags Mode",
          options: {
            ticket: "Ticket",
            contact: "Contact",
            both: "Ticket and Contact"
          }
        }
      },
      messagesList: {
        header: {
          assignedTo: "Assigned to:",
          buttons: {
            return: "Return",
            resolve: "Resolve",
            reopen: "Reopen",
            accept: "Accept",
            call: "Call",
            endCall: "End Call"
          }
        }
      },
      messagesInput: {
        placeholderOpen: "Type a message",
        placeholderClosed: "Reopen or accept this ticket to send a message.",
        signMessage: "Sign",
        replying: "Replying",
        editing: "Editing"
      },
      message: {
        edited: "Edited",
        forwarded: "Forwarded"
      },

      contactDrawer: {
        header: "Contact Information",
        buttons: {
          edit: "Edit Contact"
        },
        extraInfo: "Other information"
      },
      ticketOptionsMenu: {
        schedule: "Schedule",
        delete: "Delete",
        transfer: "Transfer",
        appointmentsModal: {
          title: "Ticket Notes",
          textarea: "Note",
          placeholder: "Insert the information you want to record here"
        },
        confirmationModal: {
          title: "Delete contact ticket",
          message: "Attention! All messages related to the ticket will be lost."
        },
        buttons: {
          delete: "Delete",
          cancel: "Cancel"
        }
      },
      confirmationModal: {
        buttons: {
          confirm: "Ok",
          cancel: "Cancel"
        }
      },
      messageOptionsMenu: {
        delete: "Delete",
        edit: "Edit",
        forward: "Forward",
        history: "History",
        reply: "Reply",
        confirmationModal: {
          title: "Delete message?",
          message: "This action cannot be undone."
        }
      },
      messageHistoryModal: {
        close: "Close",
        title: "Message edit history"
      },
      presence: {
        unavailable: "Unavailable",
        available: "Available",
        composing: "Composing...",
        recording: "Recording...",
        paused: "Paused"
      },
      privacyModal: {
        title: "Edit Whatsapp Privacy",
        buttons: {
          cancel: "Cancel",
          okEdit: "Save"
        },
        form: {
          menu: {
            all: "All",
            none: "Nobody",
            contacts: "My contacts",
            contact_blacklist: "Selected contacts",
            match_last_seen: "Match Last Seen",
            known: "Known",
            disable: "Disabled",
            hrs24: "24 Hours",
            dias7: "7 Days",
            dias90: "90 Days"
          },
          readreceipts: "To update the Read Receipts privacy",
          profile: "To update the Profile Picture privacy",
          status: "To update the Messages privacy",
          online: "To update the Online privacy",
          last: "To update the LastSeen privacy",
          groupadd: "To update the Groups Add privacy",
          calladd: "To update the Call Add privacy",
          disappearing: "To update the Default Disappearing Mode"
        }
      },
      phoneNumberInput: {
        country: "Country",
        phoneNumber: "Phone Number",
        localNumber: "Local Number"
      },
      frontendErrors: {
        ERR_CONFIG_ERROR: "Configuration error. Please contact support.",
        ERR_CLOCK_OUT_OF_SYNC:
          "Clock out of sync. Please check the date and time settings of your device.",
        ERR_BACKEND_UNREACHABLE: "Backend unreachable. Please try again later.",
        ERR_BACKEND_NOT_READY:
          "Backend is starting up and not ready yet. Retrying automatically."
      },
      backendErrors: {
        ERR_HELP_INVALID_TYPE: "Invalid content type.",
        ERR_HELP_REQUIRED: "Fill in the required content fields.",
        ERR_HELP_INVALID_NAME: "Invalid content title.",
        ERR_HELP_INVALID_GROUP: "The given card does not exist.",
        ERR_HELP_GROUP_REQUIRED: "Choose a card for the content.",
        ERR_HELP_VIDEO_REQUIRED: "Provide the YouTube video or a link.",
        ERR_HELP_INVALID_VIDEO:
          "Invalid video link. Paste the YouTube address or the 11-character ID.",
        ERR_HELP_CONTENT_REQUIRED: "The article cannot be empty.",
        ERR_NO_HELP_FOUND: "Help content not found.",
        ERR_NO_HELP_GROUP_FOUND: "Help card not found.",
        ERR_HELP_REORDER_EMPTY: "No content provided to reorder.",
        ERR_HELP_REORDER_INVALID:
          "Only contents from the same card can be reordered.",
        ERR_HELP_GROUP_REORDER_EMPTY: "No cards provided to reorder.",
        ERR_HELP_GROUP_REORDER_INVALID:
          "Only cards from the same audience can be reordered.",
        ERR_HELP_GROUP_INVALID_TITLE: "Invalid card title.",
        ERR_HELP_GROUP_INVALID_AUDIENCE: "Invalid card audience.",
        ERR_UNAUTHORIZED: "You are not authorized to perform this action.",
        ERR_FORBIDDEN: "You do not have permission to access this resource.",
        ERR_CHECK_NUMBER: "Check the number and try again.",
        ERR_NO_OTHER_WHATSAPP: "There must be at least one default WhatsApp.",
        ERR_NO_DEF_WAPP_FOUND:
          "No default WhatsApp found. Check the connections page.",
        ERR_WAPP_NOT_INITIALIZED:
          "This WhatsApp session has not been initialized. Check the connections page.",
        ERR_WAPP_CHECK_CONTACT:
          "Could not check WhatsApp contact. Check the connections page.",
        ERR_WAPP_INVALID_CONTACT: "This is not a valid WhatsApp number.",
        ERR_WAPP_DOWNLOAD_MEDIA:
          "Could not download media from WhatsApp. Check the connections page.",
        ERR_INVALID_CREDENTIALS: "Authentication error. Please try again.",
        ERR_SENDING_WAPP_MSG:
          "Error sending WhatsApp message. Check the connections page.",
        ERR_DELETE_WAPP_MSG: "Could not delete WhatsApp message.",
        ERR_EDITING_WAPP_MSG: "Could not edit WhatsApp message.",
        ERR_OTHER_OPEN_TICKET:
          "There is already an open ticket for this contact.",
        ERR_SESSION_EXPIRED: "Session expired. Please log in.",
        ERR_USER_CREATION_DISABLED:
          "User creation has been disabled by the administrator.",
        ERR_NO_PERMISSION:
          "You do not have permission to access this resource.",
        ERR_DUPLICATED_CONTACT: "A contact with this number already exists.",
        ERR_NO_SETTING_FOUND: "No setting found with this ID.",
        ERR_NO_CONTACT_FOUND: "No contact found with this ID.",
        ERR_NO_TICKET_FOUND: "No ticket found with this ID.",
        ERR_NO_USER_FOUND: "No user found with this ID.",
        ERR_NO_WAPP_FOUND: "No WhatsApp found with this ID.",
        ERR_CREATING_MESSAGE: "Error creating message in the database.",
        ERR_CREATING_TICKET: "Error creating ticket in the database.",
        ERR_FETCH_WAPP_MSG:
          "Error fetching message from WhatsApp, perhaps it is too old.",
        ERR_QUEUE_COLOR_ALREADY_EXISTS:
          "This color is already in use, choose another.",
        ERR_WAPP_GREETING_REQUIRED:
          "Greeting message is mandatory when there is more than one queue.",
        ERR_SUBSCRIPTION_CHECK_FAILED: "Subscription check failed.",
        ERR_WAPP_NOT_FOUND: "Connection unavailable.",
        ERR_SUBSCRIPTION_EXPIRED: "Your subscription has expired.",
        ERR_UNKOWN: "Unknown error."
      },
      phoneCall: {
        hangup: "Hang up"
      },
      wavoipModal: {
        title: "Enter your Wavoip connection token",
        instructions:
          "By accessing the address below you can create an account with 50 free calls for testing",
        coupon: "Check the available discount terms when subscribing."
      },
      openHours: {
        title: "Business Hours",
        timezone: {
          placeholder: "Select time zone",
          searchPlaceholder: "Type to search...",
          selected: "Selected time zone"
        },
        tabs: {
          weekly: "Weekly Hours",
          overrides: "Exceptions and Holidays"
        },
        weekly: {
          title: "Weekly Business Hours",
          description:
            "Configure regular business hours for each day of the week.",
          rule: "Rule",
          days: "Days of the Week",
          hours: "Hours",
          closedMessage: "Closed (no hours defined)",
          addHour: "Add Hours",
          addRule: "Add New Weekly Rule",
          from: "From",
          to: "To",
          until: "to"
        },
        overrides: {
          title: "Exceptions and Holidays",
          description:
            "Configure specific dates with special hours or closures (holidays, events, etc.).",
          exception: "Exception",
          date: "Date",
          label: "Description",
          labelPlaceholder: "E.g.: Christmas, Carnival...",
          repeat: "Repeat",
          repeatNone: "Don't repeat",
          repeatYearly: "Yearly",
          closedDay: "Closed on this day",
          specialHours: "Special Hours",
          addHour: "Add Hours",
          addException: "Add Exception or Holiday",
          from: "From",
          to: "To",
          until: "to"
        },
        days: {
          mon: "Monday",
          tue: "Tuesday",
          wed: "Wednesday",
          thu: "Thursday",
          fri: "Friday",
          sat: "Saturday",
          sun: "Sunday"
        }
      },
      ticketz: {
        registration: {
          header: "Register in the Espaço Whats user base",
          description:
            "Fill in the fields below to register in the Espaço Whats user base and receive news about the project.",
          name: "Name",
          country: "Country",
          phoneNumber: "Whatsapp Number",
          submit: "Register"
        },
        proAd: {
          imageAlt: "Espaço Whats PRO screenshot",
          title: "Espaço Whats PRO",
          features: {
            officialChannels:
              "Official WhatsApp - Instagram - Messenger and more",
            exclusiveFeatures: "Exclusive features",
            advancedSupport: "Advanced support",
            easyMigration: "Easy migration"
          },
          subscribePrice: "Subscribe for {{monthlyPrice}}/month",
          subscribeSubtitle: "directly inside the system",
          ctaUpgrade: "Click for upgrade instructions",
          ctaVisitSite: "Click to visit the website!",
          instructions: {
            title: "Upgrade Instructions",
            stepIntro:
              "If you installed the images provided by the project on a server or VPS using the simplified instructions, all you need to do is access your server and run the command below:",
            stepInstall:
              'In a few moments Espaço Whats PRO will be installed with all your data; then go to the user menu, click "Espaço Whats PRO Subscription", and complete your subscription.',
            helpPrefix:
              "If your installation is different or you believe you need help installing Espaço Whats PRO, ",
            helpLink: "contact us",
            helpSuffix: " and we will help you!"
          }
        },
        support: {
          title: "Support Espaço Whats project",
          mercadopagotitle: "Credit Card",
          recurringbrl: "Recurring donations in BRL",
          paypaltitle: "Credit Card",
          international: "Donations in USD"
        }
      }
    }
  }
};

export { messages };
