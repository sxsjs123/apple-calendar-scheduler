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
const userPanelStatusEl = document.querySelector("#userPanelStatus");
const bookingUser = document.querySelector("#bookingUser");
const bookingFilter = document.querySelector("#bookingFilter");
const bookingSearch = document.querySelector("#bookingSearch");
const dateFilter = document.querySelector("#dateFilter");
const startDateFilter = document.querySelector("#startDateFilter");
const endDateFilter = document.querySelector("#endDateFilter");
const dateRangeFilters = document.querySelector("#dateRangeFilters");
const resetFilters = document.querySelector("#resetFilters");
const saveBooking = document.querySelector("#saveBooking");
const saveUser = userForm.querySelector('button[type="submit"]');
const subscriptionUser = document.querySelector("#subscriptionUser");
const subscriptionUrl = document.querySelector("#subscriptionUrl");
const subscriptionInfo = document.querySelector("#subscriptionInfo");
const copySubscription = document.querySelector("#copySubscription");
const openSelectedSubscription = document.querySelector("#openSelectedSubscription");
const openSubscription = document.querySelector("#openSubscription");
const downloadCalendar = document.querySelector("#downloadCalendar");
const calendarTitle = document.querySelector("#calendarTitle");
const calendarGrid = document.querySelector("#calendarGrid");
const prevMonth = document.querySelector("#prevMonth");
const currentMonth = document.querySelector("#currentMonth");
const nextMonth = document.querySelector("#nextMonth");

let users = [];
let bookings = [];
let selectedBookingUserId = "";
let selectedSubscriptionUserId = "";
let selectedBookingFilterId = "";
let bookingSearchText = "";
let selectedDateFilter = "all";
let customStartDate = "";
let customEndDate = "";
let visibleMonth = new Date();
let statusTimer;
let userStatusTimer;
let userPanelStatusTimer;

const allCalendarUrl = `${window.location.origin}/calendar.ics`;
downloadCalendar.href = allCalendarUrl;
openSubscription.href = toWebcalUrl(allCalendarUrl);

function showStatus(message, isError = false) {
  window.clearTimeout(statusTimer);
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
  if (message && !isError) {
    statusTimer = window.setTimeout(() => showStatus(""), 5000);
  }
}

function showUserStatus(message, isError = false) {
  window.clearTimeout(userStatusTimer);
  userStatusEl.textContent = message;
  userStatusEl.classList.toggle("error", isError);
  if (message && !isError) {
    userStatusTimer = window.setTimeout(() => showUserStatus(""), 5000);
  }
}

function showUserPanelStatus(message, isError = false) {
  window.clearTimeout(userPanelStatusTimer);
  userPanelStatusEl.textContent = message;
  userPanelStatusEl.classList.toggle("error", isError);
  if (message && !isError) {
    userPanelStatusTimer = window.setTimeout(() => showUserPanelStatus(""), 5000);
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function todayInputValue() {
  return dateInputValue(new Date());
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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

function formatMonthTitle(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long"
  }).format(date);
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

function addLocalDays(date, dayCount) {
  const next = new Date(date);
  next.setDate(next.getDate() + dayCount);
  return next;
}

function dateBoundsForFilter() {
  const now = new Date();
  const today = todayInputValue();

  if (selectedDateFilter === "today") {
    return { start: today, end: today };
  }

  if (selectedDateFilter === "week") {
    const dayOffset = (now.getDay() + 6) % 7;
    const start = addLocalDays(now, -dayOffset);
    const end = addLocalDays(start, 6);
    return { start: dateInputValue(start), end: dateInputValue(end) };
  }

  if (selectedDateFilter === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: dateInputValue(start), end: dateInputValue(end) };
  }

  if (selectedDateFilter === "upcoming") {
    return { start: today, end: "" };
  }

  if (selectedDateFilter === "custom") {
    return { start: customStartDate, end: customEndDate };
  }

  return { start: "", end: "" };
}

function matchesDateFilter(booking) {
  const { start, end } = dateBoundsForFilter();
  if (start && booking.date < start) return false;
  if (end && booking.date > end) return false;
  return true;
}

function matchesSearch(booking) {
  if (!bookingSearchText) return true;
  const text = [
    booking.userName,
    booking.applicant,
    booking.reason,
    booking.date,
    booking.startTime,
    booking.endTime
  ].join(" ").toLowerCase();
  return text.includes(bookingSearchText);
}

function hasActiveDateFilter() {
  if (selectedDateFilter === "all") return false;
  if (selectedDateFilter === "custom") return Boolean(customStartDate || customEndDate);
  return true;
}

function hasActiveBookingFilters() {
  return Boolean(
    selectedBookingFilterId ||
      bookingSearchText ||
      hasActiveDateFilter()
  );
}

function visibleBookings() {
  return bookingsForUser(selectedBookingFilterId)
    .filter(matchesDateFilter)
    .filter(matchesSearch);
}

function sortUsers(nextUsers) {
  return nextUsers.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function sortBookings(nextBookings) {
  return nextBookings.slice().sort((a, b) => {
    const left = `${a.date}T${a.startTime}`;
    const right = `${b.date}T${b.startTime}`;
    return left.localeCompare(right);
  });
}

function timeToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function withUserName(booking) {
  const user = findUser(booking.userId);
  return {
    ...booking,
    userName: booking.userName || user?.name || "未知用户"
  };
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
  if (!selectedBookingUserId && users.length > 0) {
    selectedBookingUserId = users[0].id;
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

function renderDateFilters() {
  bookingSearch.value = bookingSearchText;
  dateFilter.value = selectedDateFilter;
  startDateFilter.value = customStartDate;
  endDateFilter.value = customEndDate;
  dateRangeFilters.classList.toggle("is-visible", selectedDateFilter === "custom");
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

  const showSubscription = document.createElement("a");
  showSubscription.className = "ghost-button";
  showSubscription.href = toWebcalUrl(calendarUrlForUser(user.id));
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
  const filteredBookings = visibleBookings();
  bookingList.replaceChildren(...filteredBookings.map(bookingTemplate));
  bookingCount.textContent = hasActiveBookingFilters()
    ? `${filteredBookings.length} / ${bookings.length} 条`
    : `${bookings.length} 条`;
  emptyState.textContent = bookings.length > 0 && filteredBookings.length === 0
    ? "没有符合条件的预约"
    : "暂无预约";
  emptyState.hidden = filteredBookings.length > 0;
}

function renderCalendar() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const monthStart = new Date(year, month, 1 - leadingDays);
  const counts = new Map();

  for (const booking of visibleBookings()) {
    counts.set(booking.date, (counts.get(booking.date) || 0) + 1);
  }

  calendarTitle.textContent = formatMonthTitle(visibleMonth);
  const today = todayInputValue();
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(monthStart);
    date.setDate(monthStart.getDate() + index);
    const value = dateInputValue(date);
    const count = counts.get(value) || 0;
    const cell = document.createElement("button");
    cell.className = "calendar-day";
    cell.type = "button";
    cell.dataset.date = value;
    cell.classList.toggle("muted-day", date.getMonth() !== month);
    cell.classList.toggle("today", value === today);
    cell.classList.toggle("has-bookings", count > 0);
    cell.setAttribute("aria-label", count > 0 ? `${value}，${count} 条预约` : `${value}，无预约`);

    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = String(date.getDate());
    cell.append(dayNumber);

    if (count > 0) {
      const badge = document.createElement("span");
      badge.className = "calendar-count";
      badge.textContent = `${count} 条`;
      cell.append(badge);
    }

    cell.addEventListener("click", () => {
      form.date.value = value;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    cells.push(cell);
  }

  calendarGrid.replaceChildren(...cells);
}

function renderAll() {
  normalizeSelections();
  renderSelects();
  renderDateFilters();
  renderUsers();
  renderSubscription();
  renderBookings();
  renderCalendar();
}

async function loadUsers() {
  const data = await fetchJson("/api/users");
  users = sortUsers(data.users);
}

async function loadBookings() {
  const data = await fetchJson("/api/bookings");
  bookings = sortBookings(data.bookings);
}

async function createUser(event) {
  event.preventDefault();
  showUserStatus("添加中...");
  saveUser.disabled = true;

  const formData = new FormData(userForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const data = await fetchJson("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    userForm.reset();
    users = sortUsers([...users, data.user]);
    selectedBookingUserId = users[0]?.id || data.user.id;
    selectedSubscriptionUserId = data.user.id;
    selectedBookingFilterId = data.user.id;
    renderAll();
    closeAddUserDialog();
    showUserPanelStatus("数据已保存。");
  } catch (error) {
    showUserStatus(error.message, true);
  } finally {
    saveUser.disabled = false;
  }
}

async function createBooking(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  if (
    payload.startTime &&
    payload.endTime &&
    timeToMinutes(payload.endTime) <= timeToMinutes(payload.startTime)
  ) {
    showStatus("结束时间必须晚于开始时间", true);
    form.endTime.focus();
    return;
  }

  showStatus("保存中...");
  saveBooking.disabled = true;

  try {
    const data = await fetchJson("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    form.reset();
    selectedBookingUserId = payload.userId;
    setDefaultTimes();
    bookings = sortBookings([...bookings, withUserName(data.booking)]);
    renderAll();
    showStatus("数据已保存。");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    saveBooking.disabled = users.length === 0;
  }
}

async function deleteUser(id) {
  const user = findUser(id);
  if (!user || !window.confirm(`确定删除“${user.name}”？`)) return;
  if (bookingsForUser(id).length > 0) {
    showUserPanelStatus("该用户已有预约，不能删除", true);
    return;
  }

  const previousUsers = users;
  const previousBookingUserId = selectedBookingUserId;
  const previousSubscriptionUserId = selectedSubscriptionUserId;
  const previousBookingFilterId = selectedBookingFilterId;
  users = users.filter(item => item.id !== id);
  renderAll();
  showUserPanelStatus("写入数据...");

  try {
    await fetchJson(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
    showUserPanelStatus("数据已保存，数据同步可能延迟几秒。");
  } catch (error) {
    users = previousUsers;
    selectedBookingUserId = previousBookingUserId;
    selectedSubscriptionUserId = previousSubscriptionUserId;
    selectedBookingFilterId = previousBookingFilterId;
    renderAll();
    showUserPanelStatus(error.message, true);
  }
}

async function deleteBooking(id) {
  if (!window.confirm("确定删除这条预约？")) return;
  const previousBookings = bookings;
  bookings = bookings.filter(booking => booking.id !== id);
  renderAll();
  showStatus("写入数据...");

  try {
    await fetchJson(`/api/bookings/${id}`, { method: "DELETE" });
    showStatus("数据已保存，数据同步可能延迟几秒。");
  } catch (error) {
    bookings = previousBookings;
    renderAll();
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
  renderCalendar();
});

bookingSearch.addEventListener("input", () => {
  bookingSearchText = bookingSearch.value.trim().toLowerCase();
  renderBookings();
  renderCalendar();
});

dateFilter.addEventListener("change", () => {
  selectedDateFilter = dateFilter.value;
  renderDateFilters();
  renderBookings();
  renderCalendar();
});

startDateFilter.addEventListener("input", () => {
  customStartDate = startDateFilter.value;
  selectedDateFilter = "custom";
  renderDateFilters();
  renderBookings();
  renderCalendar();
});

endDateFilter.addEventListener("input", () => {
  customEndDate = endDateFilter.value;
  selectedDateFilter = "custom";
  renderDateFilters();
  renderBookings();
  renderCalendar();
});

resetFilters.addEventListener("click", () => {
  selectedBookingFilterId = "";
  bookingSearchText = "";
  selectedDateFilter = "all";
  customStartDate = "";
  customEndDate = "";
  renderAll();
});

prevMonth.addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  renderCalendar();
});

currentMonth.addEventListener("click", () => {
  visibleMonth = new Date();
  renderCalendar();
});

nextMonth.addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  renderCalendar();
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
