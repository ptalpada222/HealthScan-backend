class ApiResponse {
    constructor(statusCode, data, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.sucess = statusCode < 400; // Assuming success for status codes < 400
    }
}
export default ApiResponse;