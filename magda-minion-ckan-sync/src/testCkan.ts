import CkanClient from "magda-typescript-common/src/CkanClient";

const client = new CkanClient(
    "https://demo.ckan.org",
    "49f1bfa8-5fa5-4a96-97d9-c86d4e822f5c"
);

(async () => {
    const resData = await client.createDataset();
    console.log(resData);

    console.log(
        await client.callCkanFunc("package_show", {
            id: resData.id
        })
    );
})().catch(e => {
    console.error(e);
});
