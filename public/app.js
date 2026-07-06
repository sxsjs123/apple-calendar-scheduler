const form = document.querySelector("#bookingForm");
const userForm = document.querySelector("#userForm");
const userDialog = document.querySelector("#userDialog");
const openUserDialog = document.querySelector("#openUserDialog");
const closeUserDialog = document.querySelector("#closeUserDialog");
const statusEl = document.querySelector("#status");
const userStatusEl = document.querySelector("#userStatus");
const bookingList = document.querySelector("#bookingList");
const bookingCount = document.querySelector("#bookingCount");
const emptyState = document.querySelector("#emptyState");
const userList = document.querySelector("#userList");
const userCount = document.querySelector("#userCount");
const userEmptyState = document.querySelector("#userEmptyState");
const bookingUser = document.querySelector("#bookingUser");
const bookingFilter = document.querySelector("#bookingFilter");
const saveBooking = document.querySelector("#saveBooking");
const subscriptionUser = document.querySelector("#subscriptionUser");
const subscriptionUrl = document.querySelector("#subscriptionUrl");
const subscriptionInfo = document.querySelector("#subscriptionInfo");
const copySubscription = document.querySelector("#copySubscription");
const openSelectedSubscription = document.querySelector("#openSelectedSubscription");
const openSubscription = document.querySelector("#openSubscription");
const downloadCalendar = document.querySelector("#downloadCalendar");

let users = [];
let bookings = [];
let selectedBookingUserId = "";
let selectedSubscriptionUserId = "";
let selectedBookingFilterId = "";

const allCalendarUrl = `${window.location.origin}/calendar.ics`;
downloadCalendar.href = allCalendarUrl;
openSubscription.href = toWebcalUrl(allCalendarUrl);

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function showUserStatus(message, isError = false) {
  userStatusEl.textContent = message;
  userStatusEl.classList.toggle("error", isError);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultTimes() {
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  form.date.value = todayInputValue();
  form.startTime.value = timeInputValue(now);
  form.endTime.value = timeInputValue(end);
}

function timeInputValue(date) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(new Date(`${date}T00:00:00`));
}

function toWebcalUrl(url) {
  return url.replace(/^https?:\/\//, "webcal://");
}

function calendarUrlForUser(userId) {
  if (!userId) return allCalendarUrl;
  return `${window.location.origin}/calendar/${encodeURIComponent(userId)}.ics`;
}

function findUser(userId) {
  return users.find(user => user.id === userId);
}

function bookingsForUser(userId) {
  return userId ? bookings.filter(booking => booking.userId === userId) : bookings;
}

function makeOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function normalizeSelections() {
  if (selectedBookingUserId && !findUser(selectedBookingUserId)) {
    selectedBookingUserId = "";
  }
  if (selectedSubscriptionUserId && !findUser(selectedSubscriptionUserId)) {
    selectedSubscriptionUserId = "";
  }
  if (selectedBookingFilterId && !findUser(selectedBookingFilterId)) {
    selectedBookingFilterId = "";
  }
}

function renderSelects() {
  const userOptions = users.map(user => makeOption(user.id, user.name));

  const bookingPlaceholder = makeOption("", users.length ? "请选择预约用户" : "先添加预约用户");
  bookingPlaceholder.disabled = true;
  bookingUser.replaceChildren(bookingPlaceholder, ...userOptions.map(option => option.cloneNode(true)));
  bookingUser.value = selectedBookingUserId;
  bookingUser.disabled = users.length === 0;
  saveBooking.disabled = users.length === 0;

  subscriptionUser.replaceChildren(
    makeOption("", "全部预约"),
    ...userOptions.map(option => option.cloneNode(true))
  );
  subscriptionUser.value = selectedSubscriptionUserId;

  bookingFilter.replaceChildren(
    makeOption("", "全部预约"),
    ...userOptions.map(option => option.cloneNode(true))
  );
  bookingFilter.value = selectedBookingFilterId;
}

function userTemplate(user) {
  const item = document.createElement("li");
  item.className = "user-item";

  const content = document.createElement("div");
  const name = document.createElement("p");
  name.className = "user-name";
  name.textContent = user.name;

  const meta = document.createElement("div");
  meta.className = "user-meta";
  const count = document.createElement("span");
  count.textContent = `${bookingsForUser(user.id).length} 条预约`;
  meta.append(count);
  if (user.note) {
    const note = document.createElement("span");
    note.textContent = user.note;
    meta.append(note);
  }
  content.append(name, meta);

  const actions = document.createElement("div");
  actions.className = "user-actions";

  const useForBooking = document.createElement("button");
  useForBooking.className = "ghost-button";
  useForBooking.type = "button";
  useForBooking.textContent = "快速预约";
  useForBooking.addEventListener("click", () => {
    selectedBookingUserId = user.id;
    bookingUser.value = user.id;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.applicant.focus();
  });

  const showSubscription = document.createElement("button");
  showSubscription.className = "ghost-button";
  showSubscription.type = "button";
  showSubscription.textContent = "订阅";
  showSubscription.addEventListener("click", () => {
    selectedSubscriptionUserId = user.id;
    selectedBookingFilterId = user.id;
    renderAll();
  });

  const remove = document.createElement("button");
  remove.className = "danger-button";
  remove.type = "button";
  remove.textContent = "删除";
  remove.addEventListener("click", () => deleteUser(user.id));

  actions.append(useForBooking, showSubscription, remove);
  item.append(content, actions);
  return item;
}

function renderUsers() {
  userCount.textContent = `${users.length} 位`;
  userEmptyState.hidden = users.length > 0;
  userList.replaceChildren(...users.map(userTemplate));
}

function bookingTemplate(booking) {
  const item = document.createElement("li");
  item.className = "booking-item";

  const content = document.createElement("div");
  const title = document.createElement("p");
  title.className = "booking-title";
  title.textContent = booking.reason || "预约";

  const meta = document.createElement("div");
  meta.className = "booking-meta";
  const user = document.createElement("span");
  user.textContent = booking.userName || "未分配用户";
  const date = document.createElement("span");
  date.textContent = formatDate(booking.date);
  const time = document.createElement("span");
  time.textContent = `${booking.startTime} - ${booking.endTime}`;
  const applicant = document.createElement("span");
  applicant.textContent = booking.applicant;
  meta.append(user, date, time, applicant);

  content.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "booking-actions";
  const download = document.createElement("a");
  download.className = "ghost-button";
  download.href = `/api/bookings/${booking.id}.ics`;
  download.textContent = "下载 ICS";
  const remove = document.createElement("button");
  remove.className = "danger-button";
  remove.type = "button";
  remove.textContent = "删除";
  remove.addEventListener("click", () => deleteBooking(booking.id));
  actions.append(download, remove);

  item.append(content, actions);
  return item;
}

function renderSubscription() {
  const user = findUser(selectedSubscriptionUserId);
  const currentBookings = bookingsForUser(selectedSubscriptionUserId);
  const url = calendarUrlForUser(selectedSubscriptionUserId);
  subscriptionUrl.value = url;
  openSelectedSubscription.href = toWebcalUrl(url);
  subscriptionInfo.textContent = user
    ? `${user.name}：${currentBookings.length} 条预约`
    : `全部预约：${currentBookings.length} 条`;
}

function renderBookings() {
  const visibleBookings = bookingsForUser(selectedBookingFilterId);
  bookingList.replaceChildren(...visibleBookings.map(bookingTemplate));
  bookingCount.textContent = selectedBookingFilterId
    ? `${visibleBookings.length} / ${bookings.length} 条`
    : `${bookings.length} 条`;
  emptyState.hidden = visibleBookings.length > 0;
}

function renderAll() {
  normalizeSelections();
  renderSelects();
  renderUsers();
  renderSubscription();
  renderBookings();
}

async function loadUsers() {
  const data = await fetchJson("/api/users");
  users = data.users;
}

async function loadBookings() {
  const data = await fetchJson("/api/bookings");
  bookings = data.bookings;
}

async function createUser(event) {
  event.preventDefault();
  showUserStatus("添加中...");

  const formData = new FormData(userForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const data = await fetchJson("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    userForm.reset();
    selectedBookingUserId = data.user.id;
    selectedSubscriptionUserId = data.user.id;
    selectedBookingFilterId = data.user.id;
    await loadUsers();
    renderAll();
    closeAddUserDialog();
  } catch (error) {
    showUserStatus(error.message, true);
  }
}

async function createBooking(event) {
  event.preventDefault();
  showStatus("保存中...");

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    await fetchJson("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    form.reset();
    selectedBookingUserId = payload.userId;
    setDefaultTimes();
    await loadBookings();
    renderAll();
    showStatus("已保存。");
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function deleteUser(id) {
  const user = findUser(id);
  if (!user || !window.confirm(`确定删除“${user.name}”？`)) return;

  try {
    await fetchJson(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadUsers();
    renderAll();
    showUserStatus("已删除。");
  } catch (error) {
    showUserStatus(error.message, true);
  }
}

async function deleteBooking(id) {
  if (!window.confirm("确定删除这条预约？")) return;

  try {
    await fetchJson(`/api/bookings/${id}`, { method: "DELETE" });
    await loadBookings();
    renderAll();
    showStatus("已删除。");
  } catch (error) {
    showStatus(error.message, true);
  }
}

copySubscription.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(subscriptionUrl.value);
    showStatus("订阅地址已复制。");
  } catch {
    subscriptionUrl.select();
    document.execCommand("copy");
    showStatus("订阅地址已复制。");
  }
});

function openAddUserDialog() {
  userForm.reset();
  showUserStatus("");
  if (typeof userDialog.showModal === "function") {
    userDialog.showModal();
  } else {
    userDialog.setAttribute("open", "");
  }
  userForm.elements.name.focus();
}

function closeAddUserDialog() {
  showUserStatus("");
  if (typeof userDialog.close === "function") {
    userDialog.close();
  } else {
    userDialog.removeAttribute("open");
  }
}

openUserDialog.addEventListener("click", openAddUserDialog);
closeUserDialog.addEventListener("click", closeAddUserDialog);
userDialog.addEventListener("click", event => {
  if (event.target === userDialog) closeAddUserDialog();
});

subscriptionUser.addEventListener("change", () => {
  selectedSubscriptionUserId = subscriptionUser.value;
  renderSubscription();
});

bookingUser.addEventListener("change", () => {
  selectedBookingUserId = bookingUser.value;
});

bookingFilter.addEventListener("change", () => {
  selectedBookingFilterId = bookingFilter.value;
  renderBookings();
});

userForm.addEventListener("submit", createUser);
form.addEventListener("submit", createBooking);
form.addEventListener("reset", () => {
  window.setTimeout(() => {
    setDefaultTimes();
    showStatus("");
  });
});

setDefaultTimes();
Promise.all([loadUsers(), loadBookings()])
  .then(renderAll)
  .catch(error => showStatus(error.message, true));
