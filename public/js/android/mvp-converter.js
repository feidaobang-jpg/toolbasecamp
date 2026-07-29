document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const apiInfoInput = document.getElementById('api-info');
    const resultTypeRadios = document.getElementsByName('result-type');
    const inputParamsTextarea = document.getElementById('input-params');
    const generateBtn = document.getElementById('generate-btn');
    const clearBtn = document.getElementById('clear-btn');

    // 获取所有输出元素的ID
    const outputElementIds = [
        'api-service-output',
        'call-presenter-output',
        'ui-callback-output',
        'api-class-output',
        'view-interface-output',
        'model-class-output',
        'presenter-class-output'
    ];

    // 生成按钮点击事件
    generateBtn.addEventListener('click', function() {
        const apiInfo = apiInfoInput.value.trim();
        if (!apiInfo) {
            alert('请输入API信息');
            return;
        }

        // 按空格分割API信息
        const [apiCnName, apiPath] = apiInfo.split(/\s+/);
        if (!apiCnName || !apiPath) {
            alert('请按格式输入API信息：中文名称 路径');
            return;
        }

        const selectedType = Array.from(resultTypeRadios).find(radio => radio.checked).value;
        const isList = selectedType === 'list';
        const isString = selectedType === 'string';
        const inputParams = inputParamsTextarea.value.trim();

        try {
            const result = buildCode(
                apiCnName,
                apiPath,
                isList,
                isString,
                inputParams
            );

            // 更新各个输出框的内容
            setCodeContent('api-service-output', result.apiService);
            setCodeContent('call-presenter-output', result.callPresenter);
            setCodeContent('ui-callback-output', result.uiCallback);
            setCodeContent('api-class-output', result.apiClass);
            setCodeContent('view-interface-output', result.viewInterface);
            setCodeContent('model-class-output', result.modelClass);
            setCodeContent('presenter-class-output', result.presenterClass);
        } catch (error) {
            console.error(error);
            alert('发生错误！');
        }
    });

    // 清空按钮点击事件
    clearBtn.addEventListener('click', function() {
        apiInfoInput.value = '';
        // 重置单选按钮为默认值（对象）
        resultTypeRadios[0].checked = true;
        inputParamsTextarea.value = '';
        
        // 清空所有输出框
        clearCodeContent(outputElementIds);
    });

    function buildCode(apiCnName, apiPath, isList, isString, inputParams) {
        const packageName = "com.cooby.newhycooby";
        
        // 解析API路径获取模块名和API名
        const apiModule = apiPath.substring(0, apiPath.lastIndexOf("/"));
        const moduleFromPath = apiModule.substring(apiModule.lastIndexOf("/") + 1);
        const moduleFirstUp = upperCaseFirstLetter(moduleFromPath);
        const apiName = apiPath.substring(apiPath.lastIndexOf("/") + 1);
        
        // 确定返回类型
        let jsonResult;
        if (isString) {
            jsonResult = "String";
        } else {
            if (isList) {
                jsonResult = `List<${buildApiName(moduleFromPath, apiName, true)}Result>`;
            } else {
                jsonResult = `${buildApiName(moduleFromPath, apiName, true)}Result`;
            }
        }

        // 生成API Service方法
        let importResult = "";
        if (!isString) {
            importResult = `import ${packageName}.bean.${buildApiName(moduleFromPath, apiName, true)}Result;\n`;
        }

        const apiService = `    /**\n` +
            `     * ${apiCnName}\n` +
            `     */\n` +
            `    @FormUrlEncoded\n` +
            `    @POST("${apiPath}")\n` +
            `    Flowable<${jsonResult}> ${buildApiName(moduleFromPath, apiName, false)}(@FieldMap Map<String, Object> map);\n`;

        // 处理输入参数
        const params = inputParams.split('\n').filter(line => line.trim().length > 0);
        let apiFields = "";
        let apiGetterSetter = "";
        let inputParamString = "";
        let setParamString = "";
        let transParamString = "";
        let quotationString = "";

        if (params.length > 0) {
            // 先生成所有private字段
            params.forEach(param => {
                apiFields += `    private String ${param};\n`;
            });
            
            // 再生成所有getter和setter方法
            params.forEach(param => {
                const capitalizedParam = upperCaseFirstLetter(param);
                // 生成getter方法
                apiGetterSetter += `    public String get${capitalizedParam}() {\n`;
                apiGetterSetter += `        return ${param};\n`;
                apiGetterSetter += `    }\n\n`;
                // 生成setter方法
                apiGetterSetter += `    public void set${capitalizedParam}(String ${param}) {\n`;
                apiGetterSetter += `        this.${param} = ${param};\n`;
                apiGetterSetter += `    }\n\n`;
                
                inputParamString += `String ${param}, `;
                setParamString += `        api.set${capitalizedParam}(${param});\n`;
                transParamString += `${param}, `;
                quotationString += `"", `;
            });

            inputParamString = inputParamString.slice(0, -2);
            transParamString = transParamString.slice(0, -2);
            quotationString = quotationString.slice(0, -2);
        }

        // 生成API类
        const apiClass = `package ${packageName}.httprequest.actionapi;\n\n` +
            `import ${packageName}.httprequest.service.${moduleFirstUp}ApiService;\n` +
            `import io.reactivex.Flowable;\n` +
            `import me.goldze.cooby.net.basehttp.CoobyApi;\n` +
            `import me.goldze.cooby.net.listeners.OnHttpListener;\n` +
            `import retrofit2.Retrofit;\n\n` +
            `public class ${buildApiName(moduleFromPath, apiName, true)}Api extends CoobyApi {\n\n` +
            apiFields + '\n' +
            apiGetterSetter +
            `    public ${buildApiName(moduleFromPath, apiName, true)}Api(OnHttpListener onHttpListener, Object rxCyActivity) {\n` +
            `        super(onHttpListener, rxCyActivity);\n` +
            `    }\n\n` +
            `    @Override\n` +
            `    public Flowable getFlowable(Retrofit retrofit) {\n` +
            `        return retrofit.create(${moduleFirstUp}ApiService.class).${buildApiName(moduleFromPath, apiName, false)}(object2Map(this));\n` +
            `    }\n` +
            `}\n`;

        // 生成View接口
        const viewInterface = `package ${packageName}.httprequest.iviews;\n\n` +
            `import java.util.List;\n\n` +
            `public interface I${buildApiName(moduleFromPath, apiName, true)}View {\n` +
            `    void on${buildApiName(moduleFromPath, apiName, true)}Success(${jsonResult} result);\n` +
            `}\n`;

        // 生成Model类
        const modelClass = `package ${packageName}.httprequest.imodel;\n\n` +
            `import ${packageName}.httprequest.actionapi.${buildApiName(moduleFromPath, apiName, true)}Api;\n` +
            `import me.goldze.cooby.net.basehttp.BaseModel;\n` +
            `import me.goldze.cooby.net.basehttp.HttpManager;\n` +
            `import me.goldze.cooby.net.listeners.OnHttpListener;\n` +
            `import me.goldze.cooby.net.listeners.OnResultListener;\n\n` +
            `public class ${buildApiName(moduleFromPath, apiName, true)}Model extends BaseModel {\n\n` +
            `    public ${buildApiName(moduleFromPath, apiName, true)}Model(Object rxObject, OnHttpListener onHttpListener, OnResultListener onResultListener) {\n` +
            `        super(rxObject, onHttpListener, onResultListener);\n` +
            `    }\n\n` +
            `    /**\n` +
            `     * ${apiCnName}\n` +
            `     */\n` +
            `    public void ${buildApiName(moduleFromPath, apiName, false)}(${inputParamString}) {\n` +
            `        ${buildApiName(moduleFromPath, apiName, true)}Api api = new ${buildApiName(moduleFromPath, apiName, true)}Api(mOnHttpListener, rxObject);\n` +
            setParamString +
            `        HttpManager.getInstance().postAction(api);\n` +
            `    }\n` +
            `}\n`;

        // 生成Presenter类
        const presenterClass = `package ${packageName}.httprequest.ipresenter;\n\n` +
            `import ${packageName}.httprequest.imodel.${buildApiName(moduleFromPath, apiName, true)}Model;\n` +
            `import ${packageName}.httprequest.iviews.I${buildApiName(moduleFromPath, apiName, true)}View;\n` +
            `import me.goldze.cooby.net.basehttp.BasePresenter;\n` +
            `import java.util.List;\n\n` +
            `public class ${buildApiName(moduleFromPath, apiName, true)}Presenter extends BasePresenter<I${buildApiName(moduleFromPath, apiName, true)}View, ${buildApiName(moduleFromPath, apiName, true)}Model, ${jsonResult}> {\n\n` +
            `    public ${buildApiName(moduleFromPath, apiName, true)}Presenter(Object rxObject) {\n` +
            `        super(rxObject);\n` +
            `    }\n\n` +
            `    /**\n` +
            `     * ${apiCnName}\n` +
            `     */\n` +
            `    public void ${buildApiName(moduleFromPath, apiName, false)}(${inputParamString}) {\n` +
            `        mModel.${buildApiName(moduleFromPath, apiName, false)}(${transParamString});\n` +
            `    }\n\n` +
            `    @Override\n` +
            `    public void onSuccess(${jsonResult} result) {\n` +
            `        mIview.on${buildApiName(moduleFromPath, apiName, true)}Success(result);\n` +
            `    }\n` +
            `}\n`;

        // 生成调用代码
        const callPresenter = `implements I${buildApiName(moduleFromPath, apiName, true)}View\n\nprivate ${buildApiName(moduleFromPath, apiName, true)}Presenter ${buildApiName(moduleFromPath, apiName, false)}Presenter;\n\n` +
            `        ${buildApiName(moduleFromPath, apiName, false)}Presenter = new ${buildApiName(moduleFromPath, apiName, true)}Presenter(this);\n` +
            `        ${buildApiName(moduleFromPath, apiName, false)}Presenter.${buildApiName(moduleFromPath, apiName, false)}(${quotationString});\n`;

        // 生成UI回调
        const uiCallback = `    @Override\n` +
            `    public void on${buildApiName(moduleFromPath, apiName, true)}Success(${jsonResult} result) {\n\n` +
            `    }\n`;

        return {
            apiService,
            callPresenter,
            uiCallback,
            apiClass,
            viewInterface,
            modelClass,
            presenterClass
        };
    }

    function upperCaseFirstLetter(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function buildApiName(apiModule, apiName, firstUp) {
        // 如果API名称包含-，处理成驼峰格式
        if (apiName.includes("-")) {
            const parts = apiName.split("-");
            apiName = parts.map((part, index) => 
                index === 0 ? part : upperCaseFirstLetter(part)
            ).join("");
        }
        
        // 如果模块名包含-，处理成驼峰格式
        if (apiModule.includes("-")) {
            const parts = apiModule.split("-");
            apiModule = parts.map((part, index) => 
                index === 0 ? part : upperCaseFirstLetter(part)
            ).join("");
        }
        
        return firstUp ? 
            upperCaseFirstLetter(apiModule) + upperCaseFirstLetter(apiName) : 
            apiModule + upperCaseFirstLetter(apiName);
    }
});
